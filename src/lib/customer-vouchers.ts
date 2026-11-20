// lib/customer-vouchers.ts
//
// Vouchers a signed-in customer can use at one café: promo codes the owner
// opted in to showing (promo_codes.show_in_account) that this customer can
// still redeem. Pure helpers, safe for client components; the server loader
// is customer-vouchers-data.ts. Showing a voucher is only a hint — the order
// RPC re-checks every rule when the order is placed.

import type { CustomerLanguage } from "@/lib/customer-i18n";
import { isPromoCodeFormat, normalizePromoCode, type PromoTerms } from "@/lib/promo-codes";

export interface CustomerVoucher {
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  maxDiscount: number | null;
  minSubtotal: number;
  endsAt: string | null;
  firstOrderOnly: boolean;
  /** Assigned to this customer by the café (not a public code). */
  personal: boolean;
  /** Remaining uses for this customer; null = no per-customer limit. */
  usesLeft: number | null;
}

function money(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
}

/** Normalizes the RPC's jsonb array; drops anything malformed. */
export function parseCustomerVouchers(data: unknown): CustomerVoucher[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.flatMap((row): CustomerVoucher[] => {
    if (!row || typeof row !== "object") {
      return [];
    }
    const source = row as Record<string, unknown>;
    const code = normalizePromoCode(source.code);
    const discountValue = money(source.discount_value);
    const discountType = source.discount_type === "fixed" ? "fixed" : source.discount_type === "percent" ? "percent" : null;
    if (!isPromoCodeFormat(code) || discountType === null || discountValue === null || discountValue <= 0) {
      return [];
    }
    const usesLeft = money(source.uses_left);
    return [
      {
        code,
        discountType,
        discountValue,
        maxDiscount: money(source.max_discount),
        minSubtotal: Math.max(0, money(source.min_subtotal) ?? 0),
        endsAt: typeof source.ends_at === "string" ? source.ends_at : null,
        firstOrderOnly: source.first_order_only === true,
        personal: source.personal === true,
        usesLeft: usesLeft === null ? null : Math.max(0, Math.floor(usesLeft))
      }
    ];
  });
}

export function voucherTerms(voucher: CustomerVoucher): PromoTerms {
  return {
    code: voucher.code,
    discountType: voucher.discountType,
    discountValue: voucher.discountValue,
    maxDiscount: voucher.maxDiscount,
    minSubtotal: voucher.minSubtotal
  };
}

/** "10% off (up to AED 5)" / "AED 5 off", in the customer's language. */
export function describeVoucher(
  voucher: Pick<CustomerVoucher, "discountType" | "discountValue" | "maxDiscount">,
  language: CustomerLanguage,
  formatMoney: (amount: number) => string
): string {
  const isAr = language === "ar";
  if (voucher.discountType === "percent") {
    const base = isAr ? `خصم ${voucher.discountValue}%` : `${voucher.discountValue}% off`;
    if (!voucher.maxDiscount) {
      return base;
    }
    return isAr
      ? `${base} (حتى ${formatMoney(voucher.maxDiscount)})`
      : `${base} (up to ${formatMoney(voucher.maxDiscount)})`;
  }
  return isAr ? `خصم ${formatMoney(voucher.discountValue)}` : `${formatMoney(voucher.discountValue)} off`;
}

/** Validated ?promo= from a voucher link, or null. */
export function promoCodeFromQuery(value: unknown): string | null {
  const code = normalizePromoCode(typeof value === "string" ? value : "");
  return isPromoCodeFormat(code) ? code : null;
}

export function checkoutHrefForVoucher(restaurantSlug: string, code: string): string {
  return `/r/${restaurantSlug}/checkout?promo=${encodeURIComponent(code)}`;
}
