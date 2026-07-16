import "server-only";

import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  DEFAULT_CURRENCY,
  DEFAULT_VAT_RATE,
  GRACE_DAYS,
  NET_TERMS_DAYS,
  NO_SUBSCRIPTION_ACCESS,
  TRIAL_DAYS,
  addDays,
  computeInvoiceTotals,
  computeLineTotal,
  deriveAccessLevel,
  firstOfMonth,
  invoiceIdempotencyKey,
  isInvoiceSettled,
  lastOfMonth,
  resolvePlanFeatures,
  toDateString
} from "@/lib/billing";
import type {
  Invoice,
  InvoiceLineItem,
  Payment,
  Plan,
  Subscription,
  SubscriptionStatus,
  TenantAccess
} from "@/lib/billing";

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type BillingActor = { userId: string | null; role: string | null };

export type BillingResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function getAdmin(): Admin {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("Supabase service-role client is not configured.");
  }
  return admin;
}

function today(reference: Date = new Date()): string {
  return toDateString(reference);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------
async function fetchSubscription(
  admin: Admin,
  restaurantId: string
): Promise<Subscription | null> {
  const { data } = await admin
    .from("subscriptions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  return (data as Subscription | null) ?? null;
}

async function fetchPlan(admin: Admin, planId: string): Promise<Plan | null> {
  const { data } = await admin.from("plans").select("*").eq("id", planId).maybeSingle();
  return (data as Plan | null) ?? null;
}

export async function listActivePlans(): Promise<Plan[]> {
  const admin = getAdmin();
  const { data } = await admin
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("monthly_price", { ascending: true });
  return (data as Plan[] | null) ?? [];
}

// The one helper the app reads to gate features (Feature Brief §7). Pure read —
// healing/aging happen on payment events and in the cron, never here, so this
// is safe to call during render.
export const getTenantAccess = cache(async function getTenantAccess(
  restaurantId: string
): Promise<TenantAccess> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NO_SUBSCRIPTION_ACCESS;
  }

  const subscription = await fetchSubscription(admin, restaurantId);
  if (!subscription) {
    return NO_SUBSCRIPTION_ACCESS;
  }

  const plan = await fetchPlan(admin, subscription.plan_id);

  return {
    access: deriveAccessLevel(subscription.status),
    status: subscription.status,
    plan_code: plan?.code ?? null,
    plan_name: plan?.name ?? null,
    plan_features: resolvePlanFeatures(plan?.features ?? null),
    limits: {
      max_branches: plan?.max_branches ?? null,
      max_staff: plan?.max_staff ?? null
    }
  };
});

export type SubscriptionSummary = {
  subscription: Subscription;
  plan: Plan | null;
  restaurant: { id: string; name: string; slug: string };
  outstanding: number;
};

export async function listSubscriptionsForBilling(): Promise<SubscriptionSummary[]> {
  const admin = getAdmin();
  const { data: subscriptions } = await admin
    .from("subscriptions")
    .select("*")
    .order("updated_at", { ascending: false });

  const subs = (subscriptions as Subscription[] | null) ?? [];
  if (subs.length === 0) {
    return [];
  }

  const restaurantIds = subs.map((sub) => sub.restaurant_id);
  const planIds = Array.from(new Set(subs.map((sub) => sub.plan_id)));

  const [{ data: restaurants }, { data: plans }, { data: openInvoices }] = await Promise.all([
    admin.from("restaurants").select("id,name,slug").in("id", restaurantIds),
    admin.from("plans").select("*").in("id", planIds),
    admin
      .from("invoices")
      .select("restaurant_id,total")
      .in("restaurant_id", restaurantIds)
      .in("status", ["issued"])
  ]);

  const restaurantsById = new Map(
    ((restaurants as Array<{ id: string; name: string; slug: string }> | null) ?? []).map((r) => [
      r.id,
      r
    ])
  );
  const plansById = new Map(((plans as Plan[] | null) ?? []).map((p) => [p.id, p]));
  const outstandingByRestaurant = new Map<string, number>();
  for (const invoice of (openInvoices as Array<{ restaurant_id: string; total: number }> | null) ??
    []) {
    outstandingByRestaurant.set(
      invoice.restaurant_id,
      (outstandingByRestaurant.get(invoice.restaurant_id) ?? 0) + Number(invoice.total)
    );
  }

  return subs.map((subscription) => ({
    subscription,
    plan: plansById.get(subscription.plan_id) ?? null,
    restaurant: restaurantsById.get(subscription.restaurant_id) ?? {
      id: subscription.restaurant_id,
      name: "Unknown restaurant",
      slug: ""
    },
    outstanding: outstandingByRestaurant.get(subscription.restaurant_id) ?? 0
  }));
}

export type StatusEvent = {
  id: string;
  from_status: SubscriptionStatus | null;
  to_status: SubscriptionStatus;
  reason: string | null;
  actor_role: string | null;
  created_at: string;
};

export type BillingDetail = {
  restaurant: { id: string; name: string; slug: string };
  subscription: Subscription | null;
  plan: Plan | null;
  invoices: Array<Invoice & { line_items: InvoiceLineItem[]; paid_to_date: number }>;
  payments: Payment[];
  statusEvents: StatusEvent[];
};

export async function getBillingDetail(restaurantId: string): Promise<BillingDetail | null> {
  const admin = getAdmin();
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id,name,slug")
    .eq("id", restaurantId)
    .maybeSingle();

  if (!restaurant) {
    return null;
  }

  const subscription = await fetchSubscription(admin, restaurantId);
  const plan = subscription ? await fetchPlan(admin, subscription.plan_id) : null;

  const [{ data: invoices }, { data: lineItems }, { data: payments }, { data: statusEvents }] =
    await Promise.all([
      admin
        .from("invoices")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false }),
      admin.from("invoice_line_items").select("*").eq("restaurant_id", restaurantId),
      admin
        .from("payments")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("received_at", { ascending: false }),
      admin
        .from("subscription_status_events")
        .select("id,from_status,to_status,reason,actor_role,created_at")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
    ]);

  const lineItemsByInvoice = new Map<string, InvoiceLineItem[]>();
  for (const item of (lineItems as InvoiceLineItem[] | null) ?? []) {
    const list = lineItemsByInvoice.get(item.invoice_id) ?? [];
    list.push(item);
    lineItemsByInvoice.set(item.invoice_id, list);
  }

  const paidByInvoice = new Map<string, number>();
  const paymentRows = (payments as Payment[] | null) ?? [];
  for (const payment of paymentRows) {
    paidByInvoice.set(
      payment.invoice_id,
      (paidByInvoice.get(payment.invoice_id) ?? 0) + Number(payment.amount)
    );
  }

  return {
    restaurant: restaurant as { id: string; name: string; slug: string },
    subscription,
    plan,
    invoices: ((invoices as Invoice[] | null) ?? []).map((invoice) => ({
      ...invoice,
      line_items: lineItemsByInvoice.get(invoice.id) ?? [],
      paid_to_date: paidByInvoice.get(invoice.id) ?? 0
    })),
    payments: paymentRows,
    statusEvents: (statusEvents as StatusEvent[] | null) ?? []
  };
}

// ---------------------------------------------------------------------------
// Status transitions (audited)
// ---------------------------------------------------------------------------
async function logStatusEvent(
  admin: Admin,
  subscription: Subscription,
  toStatus: SubscriptionStatus,
  reason: string,
  actor: BillingActor
): Promise<void> {
  await admin.from("subscription_status_events").insert({
    restaurant_id: subscription.restaurant_id,
    subscription_id: subscription.id,
    from_status: subscription.status,
    to_status: toStatus,
    reason,
    actor_user_id: actor.userId,
    actor_role: actor.role
  });
}

// Update a subscription's status (+ any side fields) and record the audit
// event. No-op event when the status is unchanged but side fields still apply.
async function transitionStatus(
  admin: Admin,
  subscription: Subscription,
  toStatus: SubscriptionStatus,
  reason: string,
  actor: BillingActor,
  patch: Partial<Subscription> = {}
): Promise<Subscription> {
  const { data, error } = await admin
    .from("subscriptions")
    .update({ status: toStatus, ...patch })
    .eq("id", subscription.id)
    .eq("restaurant_id", subscription.restaurant_id)
    .select("*")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  if (subscription.status !== toStatus) {
    await logStatusEvent(admin, subscription, toStatus, reason, actor);
  }

  return data as Subscription;
}

// ---------------------------------------------------------------------------
// Invoice issuance — idempotent on {subscription_id}:{period_start} (§5/§9).
// ---------------------------------------------------------------------------
async function allocateInvoiceNumber(admin: Admin, year: number): Promise<string> {
  const { data, error } = await admin.rpc("next_invoice_number", { p_year: year });
  if (error || !data) {
    throw new Error(error?.message ?? "Could not allocate an invoice number.");
  }
  return data as string;
}

type IssueInvoiceArgs = {
  subscription: Subscription;
  plan: Plan;
  periodStart: string;
  periodEnd: string;
  issuedDate: string;
  description: string;
  descriptionAr?: string | null;
  unitAmount?: number; // defaults to plan.monthly_price (multi-branch overrides)
  quantity?: number;
};

export async function issueInvoiceForPeriod(
  admin: Admin,
  args: IssueInvoiceArgs
): Promise<Invoice> {
  const idempotencyKey = invoiceIdempotencyKey(args.subscription.id, args.periodStart);

  // Idempotency guard: a prior run (or the manual path) already issued it.
  const { data: existing } = await admin
    .from("invoices")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) {
    return existing as Invoice;
  }

  const unitAmount = args.unitAmount ?? Number(args.plan.monthly_price);
  const quantity = args.quantity ?? 1;
  const lineTotal = computeLineTotal(quantity, unitAmount);
  const totals = computeInvoiceTotals([{ line_total: lineTotal }], DEFAULT_VAT_RATE);

  const year = Number(args.issuedDate.slice(0, 4));
  const invoiceNumber = await allocateInvoiceNumber(admin, year);
  const issuedAtIso = new Date(`${args.issuedDate}T00:00:00.000Z`).toISOString();
  const dueAtIso = new Date(
    `${addDays(args.issuedDate, NET_TERMS_DAYS)}T00:00:00.000Z`
  ).toISOString();

  const { data: invoice, error } = await admin
    .from("invoices")
    .insert({
      restaurant_id: args.subscription.restaurant_id,
      subscription_id: args.subscription.id,
      invoice_number: invoiceNumber,
      period_start: args.periodStart,
      period_end: args.periodEnd,
      subtotal: totals.subtotal,
      vat_rate: DEFAULT_VAT_RATE,
      vat_amount: totals.vat_amount,
      total: totals.total,
      currency: args.plan.currency ?? DEFAULT_CURRENCY,
      status: "issued",
      issued_at: issuedAtIso,
      due_at: dueAtIso,
      idempotency_key: idempotencyKey
    })
    .select("*")
    .single();

  if (error) {
    // Concurrent run won the race on the unique idempotency_key — re-read it.
    if (error.code === "23505") {
      const { data: raced } = await admin
        .from("invoices")
        .select("*")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (raced) {
        return raced as Invoice;
      }
    }
    throw new Error(error.message);
  }

  await admin.from("invoice_line_items").insert({
    restaurant_id: args.subscription.restaurant_id,
    invoice_id: (invoice as Invoice).id,
    description: args.description,
    description_ar: args.descriptionAr ?? null,
    quantity,
    unit_amount: unitAmount,
    line_total: lineTotal
  });

  return invoice as Invoice;
}

function periodLabel(periodStart: string): string {
  return new Date(`${periodStart}T00:00:00.000Z`).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

// ---------------------------------------------------------------------------
// Super-admin operations
// ---------------------------------------------------------------------------

// Put a tenant on a plan. Non-trial → active + an invoice for the current
// calendar period. Trial → trialing, no invoice (first cycle free, §13).
export async function assignPlan(
  restaurantId: string,
  planId: string,
  options: { startTrial?: boolean; actor: BillingActor }
): Promise<BillingResult<{ subscriptionId: string }>> {
  const admin = getAdmin();
  const plan = await fetchPlan(admin, planId);
  if (!plan) {
    return { ok: false, error: "Plan not found." };
  }

  const todayStr = today();
  const cycleStart = firstOfMonth(todayStr);
  const cycleEnd = lastOfMonth(todayStr);
  const startTrial = options.startTrial ?? false;
  const status: SubscriptionStatus = startTrial ? "trialing" : "active";

  const existing = await fetchSubscription(admin, restaurantId);

  let subscription: Subscription;
  if (existing) {
    const { data, error } = await admin
      .from("subscriptions")
      .update({
        plan_id: planId,
        status,
        billing_cycle_start: cycleStart,
        billing_cycle_end: cycleEnd,
        trial_ends_at: startTrial
          ? new Date(`${addDays(todayStr, TRIAL_DAYS)}T00:00:00.000Z`).toISOString()
          : existing.trial_ends_at,
        grace_until: null,
        cancel_at_period_end: false,
        cancelled_at: null
      })
      .eq("id", existing.id)
      .eq("restaurant_id", restaurantId)
      .select("*")
      .single();
    if (error) {
      return { ok: false, error: error.message };
    }
    subscription = data as Subscription;
    if (existing.status !== status) {
      await logStatusEvent(admin, existing, status, `Plan changed to ${plan.code}`, options.actor);
    }
  } else {
    const { data, error } = await admin
      .from("subscriptions")
      .insert({
        restaurant_id: restaurantId,
        plan_id: planId,
        status,
        billing_cycle_start: cycleStart,
        billing_cycle_end: cycleEnd,
        trial_ends_at: startTrial
          ? new Date(`${addDays(todayStr, TRIAL_DAYS)}T00:00:00.000Z`).toISOString()
          : null
      })
      .select("*")
      .single();
    if (error) {
      return { ok: false, error: error.message };
    }
    subscription = data as Subscription;
    await admin.from("subscription_status_events").insert({
      restaurant_id: restaurantId,
      subscription_id: subscription.id,
      from_status: null,
      to_status: status,
      reason: `Enrolled on ${plan.code}${startTrial ? " (trial)" : ""}`,
      actor_user_id: options.actor.userId,
      actor_role: options.actor.role
    });
  }

  if (!startTrial) {
    await issueInvoiceForPeriod(admin, {
      subscription,
      plan,
      periodStart: cycleStart,
      periodEnd: cycleEnd,
      issuedDate: todayStr,
      description: `${plan.name} plan — ${periodLabel(cycleStart)}`,
      descriptionAr: plan.name_ar ? `${plan.name_ar} — ${periodLabel(cycleStart)}` : null
    });
  }

  return { ok: true, data: { subscriptionId: subscription.id } };
}

// Manually issue an invoice for the current period (e.g. negotiated
// multi-branch amount). Idempotent on the period.
export async function issueCurrentPeriodInvoice(
  restaurantId: string,
  options: { unitAmount?: number; description?: string; actor: BillingActor }
): Promise<BillingResult> {
  const admin = getAdmin();
  const subscription = await fetchSubscription(admin, restaurantId);
  if (!subscription) {
    return { ok: false, error: "This restaurant has no subscription yet." };
  }
  const plan = await fetchPlan(admin, subscription.plan_id);
  if (!plan) {
    return { ok: false, error: "Plan not found." };
  }

  await issueInvoiceForPeriod(admin, {
    subscription,
    plan,
    periodStart: subscription.billing_cycle_start,
    periodEnd: subscription.billing_cycle_end,
    issuedDate: today(),
    description:
      options.description?.trim() ||
      `${plan.name} plan — ${periodLabel(subscription.billing_cycle_start)}`,
    unitAmount: options.unitAmount
  });

  return { ok: true };
}

export async function voidInvoice(
  restaurantId: string,
  invoiceId: string
): Promise<BillingResult> {
  const admin = getAdmin();
  const { error } = await admin
    .from("invoices")
    .update({ status: "void" })
    .eq("id", invoiceId)
    .eq("restaurant_id", restaurantId)
    .neq("status", "paid");
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// Record a received payment (bank transfer / cash). Settles the invoice when
// payments reach its total, and heals past_due/suspended/trialing → active.
export async function recordPayment(
  restaurantId: string,
  invoiceId: string,
  input: {
    amount: number;
    method: Payment["method"];
    reference?: string | null;
    receivedAt?: string;
    actor: BillingActor;
  }
): Promise<BillingResult> {
  const admin = getAdmin();
  if (!(input.amount > 0)) {
    return { ok: false, error: "Payment amount must be greater than zero." };
  }

  const { data: invoice } = await admin
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!invoice) {
    return { ok: false, error: "Invoice not found." };
  }

  const { error: paymentError } = await admin.from("payments").insert({
    restaurant_id: restaurantId,
    invoice_id: invoiceId,
    amount: input.amount,
    method: input.method,
    reference: input.reference?.trim() || null,
    received_at: input.receivedAt
      ? new Date(input.receivedAt).toISOString()
      : new Date().toISOString(),
    recorded_by_user_id: input.actor.userId
  });
  if (paymentError) {
    return { ok: false, error: paymentError.message };
  }

  // Recompute settlement from all recorded payments.
  const { data: payments } = await admin
    .from("payments")
    .select("amount")
    .eq("invoice_id", invoiceId)
    .eq("restaurant_id", restaurantId);
  const paidToDate = ((payments as Array<{ amount: number }> | null) ?? []).reduce(
    (sum, row) => sum + Number(row.amount),
    0
  );

  const settled = isInvoiceSettled(Number((invoice as Invoice).total), paidToDate);
  if (settled && (invoice as Invoice).status === "issued") {
    await admin
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoiceId)
      .eq("restaurant_id", restaurantId);

    // A settled invoice heals the subscription (§6: payment is the only thing
    // that recovers past_due / suspended; first paid invoice converts trial).
    const subscription = await fetchSubscription(admin, restaurantId);
    if (
      subscription &&
      ["past_due", "suspended", "trialing"].includes(subscription.status)
    ) {
      await transitionStatus(
        admin,
        subscription,
        "active",
        `Invoice ${(invoice as Invoice).invoice_number} settled`,
        input.actor,
        { grace_until: null }
      );
    }
  }

  return { ok: true };
}

// Manual super-admin status override (concierge escape hatch). Keeps the audit
// trail and the grace/cancel side fields consistent with the new status.
export async function changeStatusManually(
  restaurantId: string,
  toStatus: SubscriptionStatus,
  reason: string,
  actor: BillingActor
): Promise<BillingResult> {
  const admin = getAdmin();
  const subscription = await fetchSubscription(admin, restaurantId);
  if (!subscription) {
    return { ok: false, error: "This restaurant has no subscription yet." };
  }

  const patch: Partial<Subscription> = {};
  if (toStatus === "past_due") {
    patch.grace_until = addDays(today(), GRACE_DAYS);
  } else if (toStatus === "active") {
    patch.grace_until = null;
    patch.cancel_at_period_end = false;
    patch.cancelled_at = null;
  } else if (toStatus === "cancelled") {
    patch.cancelled_at = new Date().toISOString();
  }

  await transitionStatus(
    admin,
    subscription,
    toStatus,
    reason.trim() || "Manual status change by super admin",
    actor,
    patch
  );

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Daily cron (§9). Renew → generate → age → suspend → close. Idempotent: a
// double-run never double-bills (invoice idempotency_key) and only transitions
// subscriptions out of their source state, so re-running is a no-op.
//
// The cron only generates and ages. It NEVER touches the customer ordering PWA
// (accepting_orders / is_active) — suspension soft-blocks admin surfaces only.
// ---------------------------------------------------------------------------
export type BillingCronSummary = {
  trialConverted: number;
  renewed: number;
  invoicesIssued: number;
  aged: number;
  suspended: number;
  cancelled: number;
};

const CRON_ACTOR: BillingActor = { userId: null, role: "system" };

export async function runDailyBilling(now: Date = new Date()): Promise<BillingCronSummary> {
  const admin = getAdmin();
  const todayStr = toDateString(now);
  const nowIso = now.toISOString();
  const summary: BillingCronSummary = {
    trialConverted: 0,
    renewed: 0,
    invoicesIssued: 0,
    aged: 0,
    suspended: 0,
    cancelled: 0
  };

  // 1. Trial conversion: trial elapsed → active, enrolled into the calendar
  //    cycle. Stub days until the next 1st are free; first invoice issues on
  //    the next renewal pass.
  const { data: trialing } = await admin
    .from("subscriptions")
    .select("*")
    .eq("status", "trialing")
    .not("trial_ends_at", "is", null)
    .lte("trial_ends_at", nowIso);
  for (const subscription of (trialing as Subscription[] | null) ?? []) {
    await transitionStatus(admin, subscription, "active", "Trial ended", CRON_ACTOR, {
      billing_cycle_start: firstOfMonth(todayStr),
      billing_cycle_end: lastOfMonth(todayStr)
    });
    summary.trialConverted += 1;
  }

  // 2. Renew + generate: period ended and not cancelling → roll to the new
  //    calendar month and issue the next invoice (idempotent).
  const { data: dueForRenewal } = await admin
    .from("subscriptions")
    .select("*")
    .in("status", ["active", "past_due"])
    .eq("cancel_at_period_end", false)
    .lt("billing_cycle_end", todayStr);
  for (const subscription of (dueForRenewal as Subscription[] | null) ?? []) {
    const plan = await fetchPlan(admin, subscription.plan_id);
    if (!plan) {
      continue;
    }
    const periodStart = firstOfMonth(todayStr);
    const periodEnd = lastOfMonth(todayStr);

    const { data: rolled } = await admin
      .from("subscriptions")
      .update({ billing_cycle_start: periodStart, billing_cycle_end: periodEnd })
      .eq("id", subscription.id)
      .eq("restaurant_id", subscription.restaurant_id)
      .select("*")
      .single();
    summary.renewed += 1;

    const { data: priorInvoice } = await admin
      .from("invoices")
      .select("id")
      .eq("idempotency_key", invoiceIdempotencyKey(subscription.id, periodStart))
      .maybeSingle();

    await issueInvoiceForPeriod(admin, {
      subscription: (rolled as Subscription | null) ?? subscription,
      plan,
      periodStart,
      periodEnd,
      issuedDate: todayStr,
      description: `${plan.name} plan — ${periodLabel(periodStart)}`,
      descriptionAr: plan.name_ar ? `${plan.name_ar} — ${periodLabel(periodStart)}` : null
    });
    if (!priorInvoice) {
      summary.invoicesIssued += 1;
    }
  }

  // 3. Age overdue: issued invoices past due_at → subscription past_due, with a
  //    grace window. Only active subscriptions transition (idempotent re-runs).
  const { data: overdue } = await admin
    .from("invoices")
    .select("id,subscription_id,restaurant_id,due_at,invoice_number")
    .eq("status", "issued")
    .lt("due_at", nowIso);
  for (const invoice of (overdue as Array<{
    subscription_id: string;
    restaurant_id: string;
    due_at: string | null;
    invoice_number: string;
  }> | null) ?? []) {
    const subscription = await fetchSubscription(admin, invoice.restaurant_id);
    if (!subscription || subscription.status !== "active") {
      continue;
    }
    const dueDate = (invoice.due_at ?? nowIso).slice(0, 10);
    await transitionStatus(
      admin,
      subscription,
      "past_due",
      `Invoice ${invoice.invoice_number} past due`,
      CRON_ACTOR,
      { grace_until: addDays(dueDate, GRACE_DAYS) }
    );
    summary.aged += 1;
  }

  // 4. Suspend: grace window elapsed while still past_due → suspended
  //    (admin soft-block only; customer ordering stays live).
  const { data: toSuspend } = await admin
    .from("subscriptions")
    .select("*")
    .eq("status", "past_due")
    .not("grace_until", "is", null)
    .lt("grace_until", todayStr);
  for (const subscription of (toSuspend as Subscription[] | null) ?? []) {
    await transitionStatus(
      admin,
      subscription,
      "suspended",
      "Grace period elapsed without payment",
      CRON_ACTOR
    );
    summary.suspended += 1;
  }

  // 5. Close cancellations: cancel-at-period-end subs whose period ended.
  const { data: toClose } = await admin
    .from("subscriptions")
    .select("*")
    .eq("cancel_at_period_end", true)
    .neq("status", "cancelled")
    .lt("billing_cycle_end", todayStr);
  for (const subscription of (toClose as Subscription[] | null) ?? []) {
    await transitionStatus(
      admin,
      subscription,
      "cancelled",
      "Cancellation closed at period end",
      CRON_ACTOR,
      { cancelled_at: nowIso }
    );
    summary.cancelled += 1;
  }

  return summary;
}
