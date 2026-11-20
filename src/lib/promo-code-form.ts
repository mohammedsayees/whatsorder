import { getRestaurantDayStartIso } from "@/lib/date-time";
import { isPromoCodeFormat, normalizePromoCode } from "@/lib/promo-codes";
import type { RestaurantLocalization } from "@/lib/types";

// Validates the owner's "New promo code" form. Pure so it can be unit tested;
// the database constraints re-check every rule on insert.

export type PromoCodeInsert = {
  code: string;
  description: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number;
  max_discount: number | null;
  min_subtotal: number;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  max_redemptions_per_customer: number | null;
  first_order_only: boolean;
};

export type PromoFormResult =
  | { ok: true; value: PromoCodeInsert }
  | { ok: false; error: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optionalNumber(formData: FormData, key: string): number | null | "invalid" {
  const raw = text(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : "invalid";
}

function money(value: number) {
  return Math.round(value * 100) / 100;
}

export function parsePromoCodeForm(
  formData: FormData,
  restaurant?: Partial<RestaurantLocalization> | null
): PromoFormResult {
  const code = normalizePromoCode(text(formData, "code"));
  if (!isPromoCodeFormat(code)) {
    return {
      ok: false,
      error: "Codes are 3–24 letters or numbers (dashes and underscores allowed), e.g. SAVE10."
    };
  }

  const discountType = text(formData, "discount_type") === "fixed" ? "fixed" : "percent";
  const discountValue = optionalNumber(formData, "discount_value");
  if (discountValue === null || discountValue === "invalid" || discountValue <= 0) {
    return { ok: false, error: "Enter a discount greater than zero." };
  }
  if (discountType === "percent" && discountValue > 100) {
    return { ok: false, error: "A percentage discount cannot be more than 100%." };
  }

  const maxDiscount = optionalNumber(formData, "max_discount");
  if (maxDiscount === "invalid" || (maxDiscount !== null && maxDiscount <= 0)) {
    return { ok: false, error: "The maximum discount must be greater than zero, or left blank." };
  }

  const minSubtotal = optionalNumber(formData, "min_subtotal");
  if (minSubtotal === "invalid" || (minSubtotal !== null && minSubtotal < 0)) {
    return { ok: false, error: "The minimum order must be zero or more." };
  }

  const maxRedemptions = optionalNumber(formData, "max_redemptions");
  const perCustomer = optionalNumber(formData, "max_redemptions_per_customer");
  for (const limit of [maxRedemptions, perCustomer]) {
    if (limit === "invalid" || (limit !== null && (!Number.isInteger(limit) || limit < 1))) {
      return { ok: false, error: "Usage limits must be whole numbers of 1 or more, or left blank." };
    }
  }

  const startsKey = text(formData, "starts_on");
  const endsKey = text(formData, "ends_on");
  const startsAt = startsKey ? getRestaurantDayStartIso(startsKey, restaurant) : null;
  const endsDayStart = endsKey ? getRestaurantDayStartIso(endsKey, restaurant) : null;
  if ((startsKey && !startsAt) || (endsKey && !endsDayStart)) {
    return { ok: false, error: "Enter valid start and end dates." };
  }
  // A code is valid through the whole of its end day, restaurant time.
  const endsAt = endsDayStart
    ? new Date(new Date(endsDayStart).getTime() + DAY_MS - 1000).toISOString()
    : null;
  if (startsAt && endsAt && endsAt <= startsAt) {
    return { ok: false, error: "The end date must be on or after the start date." };
  }

  const description = text(formData, "description").slice(0, 200);

  return {
    ok: true,
    value: {
      code,
      description: description || null,
      discount_type: discountType,
      discount_value: money(discountValue),
      max_discount: discountType === "percent" && maxDiscount !== null ? money(maxDiscount) : null,
      min_subtotal: money(minSubtotal ?? 0),
      starts_at: startsAt,
      ends_at: endsAt,
      max_redemptions: maxRedemptions as number | null,
      max_redemptions_per_customer: perCustomer as number | null,
      first_order_only: formData.get("first_order_only") === "on"
    }
  };
}
