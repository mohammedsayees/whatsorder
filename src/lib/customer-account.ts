// lib/customer-account.ts
//
// Types and pure helpers for the customer account page (/r/[slug]/account).
// No I/O here: the server loader lives in customer-account-data.ts. Safe to
// import from client components.

import type { CartLine } from "@/lib/types";
import type { CustomerLoyalty } from "@/lib/customer-auth/context";

export const ACCOUNT_ORDERS_PAGE_SIZE = 20;

export interface CustomerAccountProfile {
  id: string;
  name: string | null;
  phone: string;
  default_address_text: string | null;
  default_landmark: string | null;
  delivery_area: string | null;
  delivery_address: string | null;
  total_orders: number | null;
  total_spend: number | null;
  last_order_at: string | null;
  member_since: string | null;
  consent_marketing: boolean | null;
}

export interface CustomerAccountOrder {
  id: string;
  created_at: string;
  status: string;
  total: number;
  subtotal: number | null;
  delivery_fee: number | null;
  discount_amount: number | null;
  loyalty_discount: number | null;
  promo_code: string | null;
  items: CartLine[] | null;
  fulfilment_type: string | null;
  payment_method: string | null;
  online_payment_status: string | null;
  online_paid_at: string | null;
  points_earned: number | null;
  points_redeemed: number | null;
}

export interface CustomerLoyaltyEntry {
  id: string;
  created_at: string;
  type: string;
  points: number;
  description: string | null;
  order_id: string | null;
}

export interface CustomerAccountPage {
  orders: CustomerAccountOrder[];
  hasMore: boolean;
}

export interface CustomerAccount extends CustomerAccountPage {
  phone: string;
  profile: CustomerAccountProfile | null;
  loyalty: CustomerLoyalty | null;
  loyaltyHistory: CustomerLoyaltyEntry[];
}

export type PaymentMethodKind = "cash" | "card" | "upi" | "online" | "credit" | "unknown";

export type PaymentState =
  | "paid"
  | "refunded"
  | "pending"
  | "failed"
  | "due"
  | "on_account"
  | "not_charged";

export function paymentMethodKind(method: string | null | undefined): PaymentMethodKind {
  switch (method) {
    case "Cash on Delivery":
      return "cash";
    case "Card on Delivery":
      return "card";
    case "UPI":
      return "upi";
    case "Online Payment":
      return "online";
    case "Customer Credit":
      return "credit";
    default:
      return "unknown";
  }
}

/**
 * What the customer should read about an order's payment. Online payments
 * follow Stripe's status; pay-on-collection methods count as paid once the
 * order is completed, and a cancelled unpaid order was never charged.
 */
export function paymentState(
  order: Pick<CustomerAccountOrder, "payment_method" | "online_payment_status" | "status">
): PaymentState {
  const kind = paymentMethodKind(order.payment_method);
  const cancelled = order.status === "Cancelled";

  if (kind === "online") {
    switch (order.online_payment_status) {
      case "paid":
        return "paid";
      case "refunded":
        return "refunded";
      case "failed":
      case "expired":
        return cancelled ? "not_charged" : "failed";
      default:
        return cancelled ? "not_charged" : "pending";
    }
  }

  if (cancelled) {
    return "not_charged";
  }
  if (kind === "credit") {
    return "on_account";
  }
  return order.status === "Completed" ? "paid" : "due";
}

/** True while the café is still working on the order (trackable). */
export function isActiveOrder(status: string): boolean {
  return status !== "Completed" && status !== "Cancelled";
}

/** Order lines that can go back into the cart; bad rows are dropped. */
export function reorderableLines(items: unknown): CartLine[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return (items as CartLine[]).filter(
    (line) => line && typeof line.item_id === "string" && Number(line.quantity) > 0
  );
}

/** Short human reference shown on receipts (matches the thank-you page). */
export function orderReference(orderId: string): string {
  return orderId.slice(-8).toUpperCase();
}

/** Sum of the discounts applied to an order, for the receipt breakdown. */
export function orderSavings(
  order: Pick<CustomerAccountOrder, "discount_amount" | "loyalty_discount">
): number {
  return Math.max(0, Number(order.discount_amount ?? 0)) +
    Math.max(0, Number(order.loyalty_discount ?? 0));
}

/** Normalize the raw RPC payload; never throws on unexpected shapes. */
export function parseCustomerAccountPayload(
  phone: string,
  data: unknown
): CustomerAccount {
  const payload = (data && typeof data === "object" ? data : {}) as {
    profile?: CustomerAccountProfile | null;
    loyalty?: CustomerLoyalty | null;
    loyalty_history?: CustomerLoyaltyEntry[] | null;
    orders?: CustomerAccountOrder[] | null;
    has_more?: boolean | null;
  };
  return {
    phone,
    profile: payload.profile ?? null,
    loyalty: payload.loyalty ?? null,
    loyaltyHistory: Array.isArray(payload.loyalty_history) ? payload.loyalty_history : [],
    orders: Array.isArray(payload.orders) ? payload.orders : [],
    hasMore: payload.has_more === true
  };
}

export const CUSTOMER_NAME_MAX_LENGTH = 80;

/** Trimmed display name, or null when it is empty or too long. */
export function cleanCustomerName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const name = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (!name || name.length > CUSTOMER_NAME_MAX_LENGTH) {
    return null;
  }
  return name;
}

/**
 * Identity of an order's basket: the same items, options and quantities in
 * any order. Prices are left out — the cart re-prices on checkout anyway.
 */
export function basketSignature(lines: CartLine[]): string {
  return lines
    .map((line) => {
      const options = (line.options ?? [])
        .map((option) => option.option_id)
        .sort()
        .join("+");
      return `${line.item_id}|${options}|${Number(line.quantity)}`;
    })
    .sort()
    .join(",");
}

export interface UsualBasket {
  /** "usual" when the same basket was ordered at least twice, else "last". */
  kind: "usual" | "last";
  order: CustomerAccountOrder;
  lines: CartLine[];
  count: number;
}

/**
 * The basket to offer a one-tap re-order for: the most repeated basket among
 * the given orders (newest first; ties go to the most recent), or the latest
 * re-orderable one when nothing repeats. Cancelled orders are ignored.
 */
export function usualBasket(orders: CustomerAccountOrder[]): UsualBasket | null {
  // Map keeps insertion order, i.e. each basket's most recent appearance.
  const seen = new Map<string, UsualBasket>();

  for (const order of orders) {
    if (order.status === "Cancelled") continue;
    const lines = reorderableLines(order.items);
    if (lines.length === 0) continue;
    const signature = basketSignature(lines);
    const entry = seen.get(signature) ?? { kind: "last" as const, order, lines, count: 0 };
    entry.count += 1;
    seen.set(signature, entry);
  }

  let best: UsualBasket | null = null;
  for (const entry of seen.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  const latest = seen.values().next().value ?? null;
  if (best && best.count >= 2) return { ...best, kind: "usual" };
  return latest ? { ...latest, kind: "last", count: 1 } : null;
}

/** Calendar day (YYYY-MM-DD) of an instant in the given time zone. */
export function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone
  }).format(new Date(iso));
}

/** Orders (newest first) grouped into consecutive calendar days. */
export function groupOrdersByDay<T extends { created_at: string }>(
  orders: T[],
  timeZone: string
): { key: string; orders: T[] }[] {
  const groups: { key: string; orders: T[] }[] = [];
  for (const order of orders) {
    const key = dayKey(order.created_at, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.orders.push(order);
    } else {
      groups.push({ key, orders: [order] });
    }
  }
  return groups;
}

function shiftDay(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** "Today" / "Yesterday" (localized), otherwise a short date like "Thu, 20 Nov". */
export function dayLabel(key: string, todayKey: string, locale: string): string {
  const offset = key === todayKey ? 0 : key === shiftDay(todayKey, -1) ? -1 : null;
  if (offset !== null) {
    const text = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(offset, "day");
    return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
  }
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: key.slice(0, 4) === todayKey.slice(0, 4) ? undefined : "numeric",
    timeZone: "UTC"
  }).format(new Date(`${key}T12:00:00Z`));
}
