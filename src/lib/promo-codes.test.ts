import { describe, expect, it } from "vitest";
import {
  checkPromoAvailability,
  computePromoDiscount,
  describePromo,
  isPromoCodeFormat,
  normalizePromoCode,
  promoErrorFromDatabase,
  PROMO_ERRORS,
  type PromoCode
} from "@/lib/promo-codes";
import { parsePromoCodeForm } from "@/lib/promo-code-form";
import { buildWhatsAppMessage } from "@/lib/whatsapp";
import { orderDiscountLabel, canDiscountOrder } from "@/lib/order-discount";

const save10: PromoCode = {
  id: "p1",
  code: "SAVE10",
  description: null,
  discountType: "percent",
  discountValue: 10,
  maxDiscount: 3,
  minSubtotal: 20,
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  maxRedemptionsPerCustomer: 1,
  firstOrderOnly: false,
  isActive: true
};

describe("promo code format", () => {
  it("normalises and validates codes", () => {
    expect(normalizePromoCode("  save10 ")).toBe("SAVE10");
    expect(isPromoCodeFormat("SAVE10")).toBe(true);
    expect(isPromoCodeFormat("EID-2026_A")).toBe(true);
    expect(isPromoCodeFormat("AB")).toBe(false);
    expect(isPromoCodeFormat("BAD CODE")).toBe(false);
    expect(isPromoCodeFormat("-START")).toBe(false);
  });
});

describe("computePromoDiscount", () => {
  it("applies the percent and its cap", () => {
    expect(computePromoDiscount(save10, 25)).toBe(2.5);
    expect(computePromoDiscount(save10, 50)).toBe(3);
  });

  it("is zero below the minimum subtotal", () => {
    expect(computePromoDiscount(save10, 19.99)).toBe(0);
  });

  it("never exceeds the subtotal for fixed codes", () => {
    const fixed = { ...save10, discountType: "fixed" as const, discountValue: 15, minSubtotal: 0 };
    expect(computePromoDiscount(fixed, 12)).toBe(12);
    expect(computePromoDiscount(fixed, 40)).toBe(15);
  });

  it("describes the offer for customers", () => {
    expect(describePromo(save10, (n) => `AED ${n}`)).toBe("10% off (up to AED 3)");
  });
});

describe("checkPromoAvailability", () => {
  const now = new Date("2026-12-01T10:00:00Z");
  it("rejects inactive, not-yet-started, expired and below-minimum codes", () => {
    expect(checkPromoAvailability({ ...save10, isActive: false }, 50, now)).toEqual({ ok: false, error: PROMO_ERRORS.invalid });
    expect(checkPromoAvailability({ ...save10, startsAt: "2026-12-02T00:00:00Z" }, 50, now)).toEqual({ ok: false, error: PROMO_ERRORS.notStarted });
    expect(checkPromoAvailability({ ...save10, endsAt: "2026-11-30T00:00:00Z" }, 50, now)).toEqual({ ok: false, error: PROMO_ERRORS.expired });
    expect(checkPromoAvailability(save10, 10, now)).toEqual({ ok: false, error: PROMO_ERRORS.minimum });
    expect(checkPromoAvailability(save10, 50, now)).toEqual({ ok: true });
  });

  it("maps database refusals to customer messages", () => {
    expect(promoErrorFromDatabase("Promo code already used")).toBe(PROMO_ERRORS.alreadyUsed);
    expect(promoErrorFromDatabase("Takeaway total is invalid")).toBeNull();
  });
});

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("parsePromoCodeForm", () => {
  const dubai = { time_zone: "Asia/Dubai" as const };

  it("accepts a full code and converts dates to restaurant-local day bounds", () => {
    const result = parsePromoCodeForm(form({
      code: "eid10", discount_type: "percent", discount_value: "10", max_discount: "5",
      min_subtotal: "20", starts_on: "2026-12-01", ends_on: "2026-12-03",
      max_redemptions: "100", max_redemptions_per_customer: "1", first_order_only: "on"
    }), dubai);
    expect(result).toEqual({
      ok: true,
      value: {
        code: "EID10", description: null, discount_type: "percent", discount_value: 10,
        max_discount: 5, min_subtotal: 20,
        starts_at: "2026-11-30T20:00:00.000Z", ends_at: "2026-12-03T19:59:59.000Z",
        max_redemptions: 100, max_redemptions_per_customer: 1, first_order_only: true,
        show_in_account: false
      }
    });
  });

  it("keeps codes private unless the owner opts in to showing them", () => {
    const base = { code: "SHOWME", discount_type: "fixed", discount_value: "5" };
    const hidden = parsePromoCodeForm(form(base), dubai);
    const shown = parsePromoCodeForm(form({ ...base, show_in_account: "on" }), dubai);
    expect(hidden.ok && hidden.value.show_in_account).toBe(false);
    expect(shown.ok && shown.value.show_in_account).toBe(true);
  });

  it("treats blank limits as unlimited and ignores a cap on fixed codes", () => {
    const result = parsePromoCodeForm(form({ code: "FIVE", discount_type: "fixed", discount_value: "5", max_discount: "2" }));
    expect(result.ok && result.value).toMatchObject({ max_discount: null, max_redemptions: null, max_redemptions_per_customer: null, min_subtotal: 0 });
  });

  it("rejects bad input", () => {
    expect(parsePromoCodeForm(form({ code: "no way", discount_value: "5" })).ok).toBe(false);
    expect(parsePromoCodeForm(form({ code: "OK1", discount_type: "percent", discount_value: "120" })).ok).toBe(false);
    expect(parsePromoCodeForm(form({ code: "OK1", discount_value: "0" })).ok).toBe(false);
    expect(parsePromoCodeForm(form({ code: "OK1", discount_value: "5", max_redemptions: "1.5" })).ok).toBe(false);
    expect(parsePromoCodeForm(form({ code: "OK1", discount_value: "5", starts_on: "2026-12-05", ends_on: "2026-12-01" })).ok).toBe(false);
  });
});

describe("promo on orders", () => {
  it("adds the promo line to the WhatsApp message", () => {
    const message = buildWhatsAppMessage({
      restaurant: { name: "Cafe", currency_code: "AED" } as never,
      customerName: "A", customerPhone: "971500000000", fulfilmentType: "takeaway",
      paymentMethod: "Cash on Delivery",
      items: [{ item_id: "t", name: "Tea", price: 10, quantity: 3 }],
      subtotal: 30, deliveryFee: 0, total: 27, promo: { code: "SAVE10", amount: 3 }
    });
    expect(message).toContain("Promo SAVE10: -");
    expect(message).toContain("Total: AED");
  });

  it("labels promo discounts and keeps staff from overwriting them", () => {
    expect(orderDiscountLabel({ discount_type: "percent", discount_value: 10, promo_code: "SAVE10" })).toBe("Promo SAVE10");
    expect(canDiscountOrder({
      status: "New", payment_method: null, online_payment_status: null,
      loyalty_discount: 0, points_redeemed: 0, promo_code: "SAVE10"
    })).toBe(false);
  });
});
