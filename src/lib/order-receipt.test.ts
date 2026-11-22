import { describe, expect, it } from "vitest";
import { receiptBreakdown, type OrderReceipt } from "./order-receipt";

const items = [
  { item_id: "k", name: "Karak Tea", price: 1, quantity: 1 },
  { item_id: "w", name: "Water", price: 1, quantity: 1 },
  { item_id: "g", name: "Grill Chicken Burger", price: 15, quantity: 1 },
  { item_id: "c", name: "Crunch Burger", price: 12, quantity: 1 }
];
const receipt = (overrides: Partial<OrderReceipt>): OrderReceipt => ({
  subtotal: null,
  delivery_fee: null,
  discount_amount: null,
  loyalty_discount: null,
  promo_code: null,
  payment_method: null,
  delivery_address: null,
  table_number: null,
  car_plate_number: null,
  ...overrides
});

describe("receiptBreakdown", () => {
  it("explains a 10% promo: AED 29 of items, AED 26.10 total", () => {
    const breakdown = receiptBreakdown(items, receipt({ subtotal: 29, discount_amount: 2.9, promo_code: "SAVE10" }));
    expect(breakdown).toMatchObject({ subtotal: 29, discount: 2.9, promoCode: "SAVE10", hasAdjustments: true });
    expect(breakdown.subtotal - breakdown.discount).toBeCloseTo(26.1);
  });

  it("falls back to the item sum and shows no breakdown for a plain order", () => {
    expect(receiptBreakdown(items, null)).toEqual({
      subtotal: 29,
      discount: 0,
      promoCode: null,
      reward: 0,
      deliveryFee: 0,
      hasAdjustments: false
    });
  });

  it("includes rewards and delivery, ignoring junk values", () => {
    const breakdown = receiptBreakdown(
      items,
      receipt({ subtotal: 29, loyalty_discount: 12, delivery_fee: 5, discount_amount: -3, promo_code: "  " })
    );
    expect(breakdown).toMatchObject({ reward: 12, deliveryFee: 5, discount: 0, promoCode: null, hasAdjustments: true });
  });
});
