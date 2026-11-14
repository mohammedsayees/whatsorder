// Owner-facing billing (staff/admin path only). Pure helpers for the
// /admin/billing page, the dashboard trial notice and the "I've paid" WhatsApp
// hand-off. No payment gateway: owners pay by bank transfer and a super admin
// records the payment. Keep this file free of server-only imports so it stays
// unit-testable; the bank details reader takes the env object as an argument.

import {
  NET_TERMS_DAYS,
  addDays,
  annualCycleEnd,
  firstOfNextMonth,
  lastOfMonth,
  parseDate,
  priceForSubscription,
  type BillingInterval,
  type Invoice,
  type Plan,
  type Subscription,
  type SubscriptionStatus
} from "@/lib/billing";
import type { RestaurantAdminSession } from "@/lib/super-admin-auth";

/** Roles that may see the restaurant's subscription and invoices. */
export const BILLING_ROLES = ["restaurant_admin", "owner"] as const satisfies ReadonlyArray<
  RestaurantAdminSession["role"]
>;

export function canViewBilling(role: string): boolean {
  return (BILLING_ROLES as ReadonlyArray<string>).includes(role);
}

export const BILLING_PAGE_HREF = "/admin/billing";

/** Legal name printed as the issuer on owner-facing invoices. */
export const INVOICE_ISSUER_NAME = "Whatsorder";

/** The dashboard trial notice shows during the last N days of a trial. */
export const TRIAL_NOTICE_DAYS = 7;

// The billing cron runs daily at 03:00 UTC (vercel.json "/api/cron/billing")
// and converts a trial on the first run at or after trial_ends_at.
export const BILLING_CRON_UTC_HOUR = 3;

// ---------------------------------------------------------------------------
// Formatting. Invoices carry their own currency; never assume AED.
// ---------------------------------------------------------------------------
export function formatBillingAmount(value: number, currency: string): string {
  const amount = Number(value);
  try {
    return new Intl.NumberFormat("en-AE", {
      style: "currency",
      currency,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    // Unknown currency code: still show the stored code and amount.
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Formats a calendar date (YYYY-MM-DD or an ISO timestamp's date part). */
export function formatBillingDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(parseDate(value));
}

export function formatBillingMonth(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(parseDate(value));
}

export function intervalLabel(interval: BillingInterval): string {
  return interval === "yearly" ? "Yearly" : "Monthly";
}

export function intervalUnit(interval: BillingInterval): string {
  return interval === "yearly" ? "year" : "month";
}

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment overdue",
  suspended: "Paused",
  cancelled: "Cancelled"
};

/** Whole days from `from` to `to` (both calendar dates). */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Trial conversion preview. Mirrors runDailyBilling step 1 + 2 without
// changing it:
//   - a trial converts on the first cron run at/after trial_ends_at;
//   - monthly: the cycle becomes the calendar month of the conversion date,
//     those remaining days are free, and the first invoice issues on the next
//     renewal pass (the 1st of the following month) for that month;
//   - yearly: the first invoice issues at conversion, for a year anchored on
//     the trial end date.
// Price follows priceForSubscription on the issue date (as issueInvoiceForPeriod
// does), so a discount that ends before then is not shown.
// ---------------------------------------------------------------------------
export type TrialConversionPreview = {
  trialEndDate: string;
  conversionDate: string;
  daysLeft: number;
  interval: BillingInterval;
  planName: string;
  currency: string;
  price: number;
  firstInvoice: {
    issueDate: string;
    dueDate: string;
    periodStart: string;
    periodEnd: string;
  };
  /** Monthly only: the last free day after the trial (end of that month). */
  freeUntil: string | null;
};

/** The UTC calendar date of the first billing-cron run at or after `iso`. */
export function trialConversionDate(trialEndsAtIso: string): string {
  const endsAt = new Date(trialEndsAtIso);
  const date = endsAt.toISOString().slice(0, 10);
  const cronRun = new Date(`${date}T00:00:00.000Z`);
  cronRun.setUTCHours(BILLING_CRON_UTC_HOUR);
  return endsAt.getTime() <= cronRun.getTime() ? date : addDays(date, 1);
}

export function buildTrialConversionPreview(input: {
  subscription: Pick<
    Subscription,
    | "status"
    | "trial_ends_at"
    | "billing_interval"
    | "price_override"
    | "price_override_ends_at"
  >;
  plan: Pick<Plan, "name" | "monthly_price" | "annual_price" | "currency">;
  today: string;
}): TrialConversionPreview | null {
  const { subscription, plan, today } = input;
  if (subscription.status !== "trialing" || !subscription.trial_ends_at) {
    return null;
  }

  const trialEndDate = subscription.trial_ends_at.slice(0, 10);
  const scheduled = trialConversionDate(subscription.trial_ends_at);
  // A trial already past its end converts on the next cron run (today at the
  // earliest), so a late conversion moves the monthly cycle with it.
  const conversionDate = scheduled < today ? today : scheduled;
  const interval = subscription.billing_interval;

  let firstInvoice: TrialConversionPreview["firstInvoice"];
  let freeUntil: string | null;
  if (interval === "yearly") {
    // runDailyBilling anchors the yearly cycle on trial_ends_at's date.
    firstInvoice = {
      issueDate: conversionDate,
      dueDate: addDays(conversionDate, NET_TERMS_DAYS),
      periodStart: trialEndDate,
      periodEnd: annualCycleEnd(trialEndDate)
    };
    freeUntil = null;
  } else {
    const issueDate = firstOfNextMonth(conversionDate);
    firstInvoice = {
      issueDate,
      dueDate: addDays(issueDate, NET_TERMS_DAYS),
      periodStart: issueDate,
      periodEnd: lastOfMonth(issueDate)
    };
    freeUntil = lastOfMonth(conversionDate);
  }

  return {
    trialEndDate,
    conversionDate,
    daysLeft: daysBetween(today, trialEndDate),
    interval,
    planName: plan.name,
    currency: plan.currency,
    price: priceForSubscription(plan, subscription, firstInvoice.issueDate),
    firstInvoice,
    freeUntil
  };
}

export function shouldShowTrialNotice(preview: TrialConversionPreview | null): boolean {
  return preview !== null && preview.daysLeft <= TRIAL_NOTICE_DAYS;
}

export function trialEndHeadline(preview: TrialConversionPreview): string {
  const date = formatBillingDate(preview.trialEndDate);
  if (preview.daysLeft < 0) return `Your free trial ended on ${date}`;
  if (preview.daysLeft === 0) return `Your free trial ends today (${date})`;
  if (preview.daysLeft === 1) return `Your free trial ends tomorrow (${date})`;
  return `Your free trial ends on ${date}, in ${preview.daysLeft} days`;
}

export function trialPlanSentence(preview: TrialConversionPreview): string {
  return `You will move to the ${preview.planName} plan at ${formatBillingAmount(
    preview.price,
    preview.currency
  )} a ${intervalUnit(preview.interval)}.`;
}

export function firstInvoiceSentence(preview: TrialConversionPreview): string {
  const amount = formatBillingAmount(preview.price, preview.currency);
  const { issueDate, dueDate, periodStart, periodEnd } = preview.firstInvoice;
  if (preview.interval === "yearly") {
    return `Your first invoice, ${amount} for ${formatBillingDate(periodStart)} to ${formatBillingDate(
      periodEnd
    )}, is issued when your trial converts on ${formatBillingDate(
      issueDate
    )} and is due by ${formatBillingDate(dueDate)}.`;
  }
  return `The days to ${formatBillingDate(
    preview.freeUntil ?? periodStart
  )} are free. Your first invoice, ${amount} for ${formatBillingMonth(
    periodStart
  )}, is issued on ${formatBillingDate(issueDate)} and is due by ${formatBillingDate(
    dueDate
  )}.`;
}

// ---------------------------------------------------------------------------
// Bank transfer details (server-side env only; never NEXT_PUBLIC).
// ---------------------------------------------------------------------------
export type BankTransferDetails = {
  accountName: string;
  bankName: string;
  iban: string;
};

export const BANK_ENV_KEYS = {
  accountName: "WHATSORDER_BANK_ACCOUNT_NAME",
  bankName: "WHATSORDER_BANK_NAME",
  iban: "WHATSORDER_BANK_IBAN"
} as const;

/** All three values must be set; otherwise owners see "contact support". */
export function readBankTransferDetails(
  env: Record<string, string | undefined>
): BankTransferDetails | null {
  const accountName = env[BANK_ENV_KEYS.accountName]?.trim();
  const bankName = env[BANK_ENV_KEYS.bankName]?.trim();
  const iban = env[BANK_ENV_KEYS.iban]?.trim();
  if (!accountName || !bankName || !iban) {
    return null;
  }
  return { accountName, bankName, iban: iban.replace(/\s+/g, " ").toUpperCase() };
}

export const BANK_DETAILS_MISSING_MESSAGE = "Contact WhatsOrder support for payment details";

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
type InvoiceAmounts = Pick<Invoice, "status" | "total"> & { paid_to_date: number };

/** Issued and not fully settled: the owner still has something to pay. */
export function isInvoiceUnpaid(invoice: InvoiceAmounts): boolean {
  return invoice.status === "issued" && amountDue(invoice) > 0;
}

export function amountDue(invoice: InvoiceAmounts): number {
  return Math.max(0, Math.round((Number(invoice.total) - Number(invoice.paid_to_date)) * 100) / 100);
}

export function isInvoiceOverdue(
  invoice: InvoiceAmounts & Pick<Invoice, "due_at">,
  now: Date = new Date()
): boolean {
  return isInvoiceUnpaid(invoice) && Boolean(invoice.due_at) && new Date(String(invoice.due_at)) < now;
}

/** Newest first: by period, then issue date, then creation. */
export function sortInvoicesNewestFirst<
  T extends Pick<Invoice, "period_start" | "issued_at" | "created_at">
>(invoices: T[]): T[] {
  return [...invoices].sort(
    (a, b) =>
      b.period_start.localeCompare(a.period_start) ||
      String(b.issued_at ?? "").localeCompare(String(a.issued_at ?? "")) ||
      b.created_at.localeCompare(a.created_at)
  );
}

export function buildPaymentReceiptMessage(input: {
  restaurantName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
}): string {
  return [
    "Hi WhatsOrder, I've paid by bank transfer.",
    `Restaurant: ${input.restaurantName}`,
    `Invoice: ${input.invoiceNumber}`,
    `Amount: ${formatBillingAmount(input.amount, input.currency)}`,
    "I'm attaching the transfer receipt."
  ].join("\n");
}

/** Invoice ids are UUIDs; reject anything else before touching the database. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
