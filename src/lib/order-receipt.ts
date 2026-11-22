// lib/order-receipt.ts
//
// Money and fulfilment details for the customer's order confirmation page.
// Pure and client-safe; the server loader lives in order-confirmation.ts.

import type { CartLine } from "@/lib/types";

/** Receipt columns read alongside the order; any may be missing on old rows. */
export type OrderReceipt = {
  subtotal: number | null;
  delivery_fee: number | null;
  discount_amount: number | null;
  loyalty_discount: number | null;
  promo_code: string | null;
  payment_method: string | null;
  delivery_address: string | null;
  table_number: string | null;
  car_plate_number: string | null;
};

export type ReceiptBreakdown = {
  subtotal: number;
  discount: number;
  promoCode: string | null;
  reward: number;
  deliveryFee: number;
  /** True when anything sits between the items and the total. */
  hasAdjustments: boolean;
};

const money = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100) / 100) : 0;
};

/**
 * Subtotal, discounts and delivery so the items always add up to the total
 * the customer sees. Falls back to the item sum when the stored subtotal is
 * missing (orders saved before the column was filled).
 */
export function receiptBreakdown(items: CartLine[], receipt: OrderReceipt | null): ReceiptBreakdown {
  const itemSum = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
  const subtotal = receipt?.subtotal !== null && receipt?.subtotal !== undefined ? money(receipt.subtotal) : money(itemSum);
  const discount = money(receipt?.discount_amount);
  const reward = money(receipt?.loyalty_discount);
  const deliveryFee = money(receipt?.delivery_fee);
  return {
    subtotal,
    discount,
    promoCode: receipt?.promo_code?.trim() || null,
    reward,
    deliveryFee,
    hasAdjustments: discount > 0 || reward > 0 || deliveryFee > 0
  };
}
