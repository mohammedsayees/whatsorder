// Promo codes (order discounts phase 2). Pure and dependency-free: the
// customer checkout imports it for the live preview, so keep it tiny.
// create_order_with_customer_v6 re-applies the same rules in the database
// under a row lock; these helpers only decide what to show and send.

export type PromoDiscountType = "percent" | "fixed";

/** The parts of a promo code the checkout needs to price an order. */
export type PromoTerms = {
  code: string;
  discountType: PromoDiscountType;
  discountValue: number;
  maxDiscount: number | null;
  minSubtotal: number;
};

export type PromoCode = PromoTerms & {
  id: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxRedemptionsPerCustomer: number | null;
  firstOrderOnly: boolean;
  isActive: boolean;
};

export const PROMO_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{2,23}$/;

export function normalizePromoCode(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase().slice(0, 24) : "";
}

export function isPromoCodeFormat(code: string): boolean {
  return PROMO_CODE_PATTERN.test(code);
}

function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/** Discount for this subtotal, or 0 below the code's minimum. */
export function computePromoDiscount(terms: PromoTerms, subtotal: number): number {
  if (!(subtotal > 0) || subtotal < terms.minSubtotal) {
    return 0;
  }

  const raw =
    terms.discountType === "percent"
      ? Math.min(
          roundMoney((subtotal * terms.discountValue) / 100),
          terms.maxDiscount ?? subtotal
        )
      : Math.min(terms.discountValue, subtotal);

  return roundMoney(Math.min(raw, subtotal));
}

/** Short customer-facing summary, e.g. "10% off (up to AED 5)". */
export function describePromo(
  terms: PromoTerms,
  formatMoney: (amount: number) => string
): string {
  const base =
    terms.discountType === "percent"
      ? `${terms.discountValue}% off`
      : `${formatMoney(terms.discountValue)} off`;
  const cap =
    terms.discountType === "percent" && terms.maxDiscount
      ? ` (up to ${formatMoney(terms.maxDiscount)})`
      : "";
  return base + cap;
}

export type PromoAvailability =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Checks a code's own settings (active, date window, minimum). Usage limits
 * need the database and are checked separately.
 */
export function checkPromoAvailability(
  promo: PromoCode,
  subtotal: number,
  now: Date = new Date()
): PromoAvailability {
  if (!promo.isActive) {
    return { ok: false, error: PROMO_ERRORS.invalid };
  }
  if (promo.startsAt && now.getTime() < new Date(promo.startsAt).getTime()) {
    return { ok: false, error: PROMO_ERRORS.notStarted };
  }
  if (promo.endsAt && now.getTime() > new Date(promo.endsAt).getTime()) {
    return { ok: false, error: PROMO_ERRORS.expired };
  }
  if (subtotal < promo.minSubtotal) {
    return { ok: false, error: PROMO_ERRORS.minimum };
  }
  return { ok: true };
}

export const PROMO_ERRORS = {
  invalid: "This promo code isn't valid.",
  notStarted: "This promo code isn't active yet.",
  expired: "This promo code has expired.",
  minimum: "Add more items to use this promo code.",
  fullyUsed: "This promo code has been fully used.",
  alreadyUsed: "You've already used this promo code.",
  firstOrderOnly: "This promo code is for first orders only.",
  changed: "This promo code has changed. Please apply it again."
} as const;

// Maps create_order_with_customer_v6 exceptions to customer messages.
const DATABASE_PROMO_ERRORS: Array<[string, string]> = [
  ["Promo code is not valid", PROMO_ERRORS.invalid],
  ["Promo code is not active yet", PROMO_ERRORS.notStarted],
  ["Promo code has expired", PROMO_ERRORS.expired],
  ["Promo code needs a higher order amount", PROMO_ERRORS.minimum],
  ["Promo code has been fully used", PROMO_ERRORS.fullyUsed],
  ["Promo code already used", PROMO_ERRORS.alreadyUsed],
  ["Promo code is for first orders only", PROMO_ERRORS.firstOrderOnly],
  ["Promo code discount has changed", PROMO_ERRORS.changed]
];

export function promoErrorFromDatabase(message: string | null | undefined): string | null {
  if (!message) {
    return null;
  }
  return DATABASE_PROMO_ERRORS.find(([needle]) => message.includes(needle))?.[1] ?? null;
}
