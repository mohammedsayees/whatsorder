// "Online payments" report: Stripe "Pay online" orders summarised from what
// WhatsOrder already stores on each order (status, total, paid time). Pure
// functions only — the page and the CSV export share them, and tests run
// without Supabase or Stripe. Amounts are what the customer was charged
// (gross); Stripe fees and bank payouts are not stored here.

import { csvCell } from "@/lib/reports";
import {
  asOnlinePaymentStatus,
  onlinePaymentStaffLabel,
  type OnlinePaymentStatus
} from "@/lib/stripe/order-payment-rules";

export type OnlinePaymentOrderRow = {
  id: string;
  customer_name: string | null;
  fulfilment_type: string | null;
  total: number | string;
  status: string;
  online_payment_status: string | null;
  online_paid_at: string | null;
  created_at: string;
};

/** Filter buckets; "not_completed" groups expired and failed checkouts. */
export type OnlinePaymentFilter = "all" | "paid" | "pending" | "not_completed" | "refunded";

export const ONLINE_PAYMENT_FILTERS: Array<{ value: OnlinePaymentFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Awaiting payment" },
  { value: "not_completed", label: "Not completed" },
  { value: "refunded", label: "Refunded" }
];

export function asOnlinePaymentFilter(value: unknown): OnlinePaymentFilter {
  return ONLINE_PAYMENT_FILTERS.some((filter) => filter.value === value)
    ? (value as OnlinePaymentFilter)
    : "all";
}

export type OnlinePaymentEntry = {
  orderId: string;
  reference: string;
  customerName: string;
  fulfilmentType: string | null;
  amount: number;
  paymentStatus: OnlinePaymentStatus;
  paymentLabel: string;
  orderStatus: string;
  placedAt: string;
  paidAt: string | null;
};

type Bucket = { count: number; amount: number };

export type OnlinePaymentsReport = {
  paid: Bucket;
  pending: Bucket;
  notCompleted: Bucket;
  refunded: Bucket;
  /** Kept online takings: refunded orders are counted separately, not in "paid". */
  collected: number;
  entries: OnlinePaymentEntry[];
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** Same short reference the customer sees ("Reference: 273AFD84"). */
export function orderReference(orderId: string) {
  return orderId.slice(-8).toUpperCase();
}

function bucketOf(status: OnlinePaymentStatus): Exclude<OnlinePaymentFilter, "all"> {
  if (status === "expired" || status === "failed") return "not_completed";
  return status;
}

export function matchesOnlinePaymentFilter(status: OnlinePaymentStatus, filter: OnlinePaymentFilter) {
  return filter === "all" || bucketOf(status) === filter;
}

/**
 * Totals cover every online order in the period; `entries` is filtered and
 * newest first. A pending payment on a cancelled order is not money owed,
 * so it is counted as "not completed" rather than "awaiting payment".
 */
export function buildOnlinePaymentsReport(
  rows: OnlinePaymentOrderRow[],
  filter: OnlinePaymentFilter = "all"
): OnlinePaymentsReport {
  const empty = (): Bucket => ({ count: 0, amount: 0 });
  const totals = { paid: empty(), pending: empty(), not_completed: empty(), refunded: empty() };
  const entries: OnlinePaymentEntry[] = [];

  for (const row of rows) {
    const stored = asOnlinePaymentStatus(row.online_payment_status);
    if (!stored) continue;
    const paymentStatus: OnlinePaymentStatus =
      stored === "pending" && row.status === "Cancelled" ? "expired" : stored;
    const amount = Number(row.total);
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    const bucket = totals[bucketOf(paymentStatus)];
    bucket.count += 1;
    bucket.amount = roundMoney(bucket.amount + safeAmount);

    if (matchesOnlinePaymentFilter(paymentStatus, filter)) {
      entries.push({
        orderId: row.id,
        reference: orderReference(row.id),
        customerName: row.customer_name?.trim() || "Customer",
        fulfilmentType: row.fulfilment_type,
        amount: safeAmount,
        paymentStatus,
        paymentLabel: onlinePaymentStaffLabel(paymentStatus) ?? paymentStatus,
        orderStatus: row.status,
        placedAt: row.created_at,
        paidAt: row.online_paid_at
      });
    }
  }

  entries.sort((a, b) => b.placedAt.localeCompare(a.placedAt));

  return {
    paid: totals.paid,
    pending: totals.pending,
    notCompleted: totals.not_completed,
    refunded: totals.refunded,
    collected: totals.paid.amount,
    entries
  };
}

export function onlinePaymentsToCsv(
  report: OnlinePaymentsReport,
  formatDateTime: (value: string) => string
) {
  const rows: Array<Array<string | number>> = [
    ["Placed", "Order reference", "Customer", "Fulfilment", "Amount", "Online payment", "Paid at", "Order status"],
    ...report.entries.map((entry) => [
      formatDateTime(entry.placedAt),
      entry.reference,
      entry.customerName,
      entry.fulfilmentType ?? "",
      entry.amount.toFixed(2),
      entry.paymentLabel,
      entry.paidAt ? formatDateTime(entry.paidAt) : "",
      entry.orderStatus
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}
