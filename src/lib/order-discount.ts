import type { Order } from "@/lib/types";

// Order-level discounts (POS phase 1). Pure and dependency-free so the punch
// screen preview, the server action and tests share one rule. The database
// function apply_order_discount mirrors it for settlement-time discounts, and
// a check constraint makes any mismatch between total and discount fail.
//
// Rules: the discount applies to the subtotal only (never the delivery fee),
// is rounded to 2 decimals, and can never exceed the subtotal.

export type OrderDiscountType = "percent" | "fixed";

export type OrderDiscountInput = {
  type: OrderDiscountType;
  value: number;
  reason: string;
};

export const DISCOUNT_REASON_MAX_LENGTH = 200;
export const DEFAULT_STAFF_DISCOUNT_MAX_PERCENT = 10;

// Roles that may give any discount. Everyone else ("staff") is capped.
const UNLIMITED_DISCOUNT_ROLES = new Set(["owner", "manager", "restaurant_admin"]);

export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function isOrderDiscountType(value: unknown): value is OrderDiscountType {
  return value === "percent" || value === "fixed";
}

/** The amount taken off the subtotal, or 0 when the input is not usable. */
export function computeDiscountAmount(
  subtotal: number,
  discount: Pick<OrderDiscountInput, "type" | "value"> | null | undefined
): number {
  if (!discount || !Number.isFinite(discount.value) || discount.value <= 0 || subtotal <= 0) {
    return 0;
  }

  if (discount.type === "percent") {
    return roundMoney((subtotal * Math.min(discount.value, 100)) / 100);
  }

  return roundMoney(Math.min(discount.value, subtotal));
}

/**
 * The most a member of this role may discount, as a percentage of the
 * subtotal, or null when unlimited.
 */
export function discountLimitPercentForRole(
  role: string,
  restaurantStaffLimit: number | null | undefined
): number | null {
  if (UNLIMITED_DISCOUNT_ROLES.has(role)) {
    return null;
  }

  const limit = Number(restaurantStaffLimit ?? DEFAULT_STAFF_DISCOUNT_MAX_PERCENT);
  return Number.isFinite(limit) ? Math.min(Math.max(limit, 0), 100) : DEFAULT_STAFF_DISCOUNT_MAX_PERCENT;
}

export function exceedsDiscountLimit(
  subtotal: number,
  amount: number,
  limitPercent: number | null
): boolean {
  if (limitPercent === null) {
    return false;
  }

  return amount > roundMoney((subtotal * limitPercent) / 100);
}

export type DiscountParseResult =
  | { ok: true; discount: OrderDiscountInput | null }
  | { ok: false; error: string };

/**
 * Validates an untrusted discount (from a form or a replayed offline
 * payload). A missing discount, or a zero value, means "no discount".
 */
export function parseOrderDiscount(raw: unknown): DiscountParseResult {
  if (raw === null || raw === undefined) {
    return { ok: true, discount: null };
  }

  if (typeof raw !== "object") {
    return { ok: false, error: "The discount could not be read." };
  }

  const candidate = raw as Record<string, unknown>;
  const value = Number(candidate.value);

  if (candidate.value === undefined || candidate.value === "" || value === 0) {
    return { ok: true, discount: null };
  }

  if (!isOrderDiscountType(candidate.type) || !Number.isFinite(value) || value < 0) {
    return { ok: false, error: "Enter a valid discount." };
  }

  if (candidate.type === "percent" && value > 100) {
    return { ok: false, error: "A percentage discount cannot be more than 100%." };
  }

  const reason =
    typeof candidate.reason === "string"
      ? candidate.reason.trim().slice(0, DISCOUNT_REASON_MAX_LENGTH)
      : "";

  if (!reason) {
    return { ok: false, error: "Enter a reason for the discount." };
  }

  return { ok: true, discount: { type: candidate.type, value: roundMoney(value), reason } };
}

export type OrderTotals = {
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
};

export function orderTotalsWithDiscount(
  subtotal: number,
  deliveryFee: number,
  discount: Pick<OrderDiscountInput, "type" | "value"> | null | undefined
): OrderTotals {
  const discountAmount = computeDiscountAmount(subtotal, discount);
  return {
    subtotal: roundMoney(subtotal),
    discountAmount,
    deliveryFee: roundMoney(deliveryFee),
    total: roundMoney(subtotal - discountAmount + deliveryFee)
  };
}

/** Short label for tickets and order cards, e.g. "Discount 10%". */
export function orderDiscountLabel(
  order: Pick<Order, "discount_type" | "discount_value">
): string {
  if (order.discount_type === "percent" && order.discount_value) {
    return `Discount ${Number(order.discount_value)}%`;
  }

  return "Discount";
}

/** Whether staff may still add, change or remove a discount on this order. */
export function canDiscountOrder(
  order: Pick<
    Order,
    | "status"
    | "payment_method"
    | "online_payment_status"
    | "loyalty_discount"
    | "points_redeemed"
  >
): boolean {
  return (
    order.status !== "Completed" &&
    order.status !== "Cancelled" &&
    order.payment_method === null &&
    !order.online_payment_status &&
    Number(order.loyalty_discount ?? 0) === 0 &&
    Number(order.points_redeemed ?? 0) === 0
  );
}
