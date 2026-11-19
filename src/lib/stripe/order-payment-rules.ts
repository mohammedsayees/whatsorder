// Pure rules for online order payments (shared by server code, staff UI and
// the customer order page; no Stripe SDK import).

export const ONLINE_PAYMENT_METHOD = "Online Payment" as const;

export type OnlinePaymentStatus = "pending" | "paid" | "expired" | "failed" | "refunded";

const STATUSES: readonly OnlinePaymentStatus[] = ["pending", "paid", "expired", "failed", "refunded"];

export function asOnlinePaymentStatus(value: unknown): OnlinePaymentStatus | null {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value)
    ? (value as OnlinePaymentStatus)
    : null;
}

/** AED/INR amounts in minor units (fils/paise), rounded to the nearest unit. */
export function toMinorUnits(amount: number) {
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

type SessionLike = { status?: string | null; payment_status?: string | null };

/** What a Checkout Session means for its order, or null for "no change". */
export function checkoutSessionOutcome(session: SessionLike): OnlinePaymentStatus | null {
  if (session.status === "complete" && (session.payment_status === "paid" || session.payment_status === "no_payment_required")) {
    return "paid";
  }
  if (session.status === "expired") {
    return "expired";
  }
  return null;
}

/** True when staff must not collect money (or record cash) for the order. */
export function isPaidOnline(status: OnlinePaymentStatus | null | undefined) {
  return status === "paid";
}

/** Short staff-facing label, or null for ordinary orders. */
export function onlinePaymentStaffLabel(status: OnlinePaymentStatus | null | undefined) {
  switch (status) {
    case "paid":
      return "Paid online";
    case "pending":
      return "Awaiting online payment";
    case "expired":
    case "failed":
      return "Online payment not completed";
    case "refunded":
      return "Refunded online";
    default:
      return null;
  }
}
