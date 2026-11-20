import { getSupabaseAdmin } from "@/lib/supabase";
import {
  checkPromoAvailability,
  computePromoDiscount,
  isPromoCodeFormat,
  normalizePromoCode,
  PROMO_ERRORS,
  type PromoCode,
  type PromoTerms
} from "@/lib/promo-codes";

// Server-only reads for promo codes. All queries use the service-role client
// and are always scoped by restaurant_id.

type PromoCodeRow = {
  id: string;
  code: string;
  description: string | null;
  discount_type: "percent" | "fixed";
  discount_value: number | string;
  max_discount: number | string | null;
  min_subtotal: number | string;
  starts_at: string | null;
  ends_at: string | null;
  max_redemptions: number | null;
  max_redemptions_per_customer: number | null;
  first_order_only: boolean;
  is_active: boolean;
};

const PROMO_COLUMNS =
  "id, code, description, discount_type, discount_value, max_discount, min_subtotal, starts_at, ends_at, max_redemptions, max_redemptions_per_customer, first_order_only, is_active";

function rowToPromo(row: PromoCodeRow): PromoCode {
  return {
    id: row.id,
    code: row.code,
    description: row.description,
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    maxDiscount: row.max_discount === null ? null : Number(row.max_discount),
    minSubtotal: Number(row.min_subtotal),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    maxRedemptions: row.max_redemptions,
    maxRedemptionsPerCustomer: row.max_redemptions_per_customer,
    firstOrderOnly: row.first_order_only,
    isActive: row.is_active
  };
}

export function promoTerms(promo: PromoCode): PromoTerms {
  return {
    code: promo.code,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    maxDiscount: promo.maxDiscount,
    minSubtotal: promo.minSubtotal
  };
}

export type PromoEvaluation =
  | { ok: true; promo: PromoCode; terms: PromoTerms; amount: number }
  | { ok: false; error: string; unavailable?: boolean };

/**
 * Validates a code for a checkout: its settings, then usage limits. With no
 * phone yet (the "Apply" preview), per-customer rules are left to submit.
 */
export async function evaluatePromoCode(
  restaurantId: string,
  rawCode: unknown,
  subtotal: number,
  customerPhone: string | null
): Promise<PromoEvaluation> {
  const code = normalizePromoCode(rawCode);
  if (!isPromoCodeFormat(code)) {
    return { ok: false, error: PROMO_ERRORS.invalid };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "Promo codes are unavailable right now.", unavailable: true };
  }

  const { data, error } = await supabase
    .from("promo_codes")
    .select(PROMO_COLUMNS)
    .eq("restaurant_id", restaurantId)
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("WhatsOrder promo code lookup failed", { code: error.code, restaurantId });
    return { ok: false, error: "Promo codes are unavailable right now.", unavailable: true };
  }
  if (!data) {
    return { ok: false, error: PROMO_ERRORS.invalid };
  }

  const promo = rowToPromo(data as PromoCodeRow);
  const availability = checkPromoAvailability(promo, subtotal);
  if (!availability.ok) {
    return availability;
  }

  const needsUsage =
    promo.maxRedemptions !== null ||
    (customerPhone !== null && (promo.maxRedemptionsPerCustomer !== null || promo.firstOrderOnly));

  if (needsUsage) {
    const usage = await supabase.rpc("get_promo_code_usage", {
      target_restaurant_id: restaurantId,
      target_promo_code_id: promo.id,
      target_phone: customerPhone
    });
    if (usage.error || !usage.data) {
      console.error("WhatsOrder promo usage lookup failed", { code: usage.error?.code, restaurantId });
      return { ok: false, error: "Promo codes are unavailable right now.", unavailable: true };
    }
    const counts = usage.data as {
      total_used: number;
      customer_used: number;
      customer_has_orders: boolean;
    };
    if (promo.maxRedemptions !== null && Number(counts.total_used) >= promo.maxRedemptions) {
      return { ok: false, error: PROMO_ERRORS.fullyUsed };
    }
    if (customerPhone !== null) {
      if (
        promo.maxRedemptionsPerCustomer !== null &&
        Number(counts.customer_used) >= promo.maxRedemptionsPerCustomer
      ) {
        return { ok: false, error: PROMO_ERRORS.alreadyUsed };
      }
      if (promo.firstOrderOnly && counts.customer_has_orders) {
        return { ok: false, error: PROMO_ERRORS.firstOrderOnly };
      }
    }
  }

  const terms = promoTerms(promo);
  const amount = computePromoDiscount(terms, subtotal);
  if (amount <= 0) {
    return { ok: false, error: PROMO_ERRORS.minimum };
  }

  return { ok: true, promo, terms, amount };
}

export type PromoCodeWithUsage = PromoCode & {
  createdAt: string;
  timesUsed: number;
  totalDiscount: number;
};

/** Every code for the admin list, newest first, with simple usage totals. */
export async function listPromoCodes(restaurantId: string): Promise<PromoCodeWithUsage[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return [];
  }

  const [codes, redemptions] = await Promise.all([
    supabase
      .from("promo_codes")
      .select(`${PROMO_COLUMNS}, created_at`)
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("promo_code_redemptions")
      .select("promo_code_id, discount_amount")
      .eq("restaurant_id", restaurantId)
  ]);

  if (codes.error) {
    throw new Error("Promo codes could not be loaded.");
  }

  const usage = new Map<string, { count: number; total: number }>();
  for (const row of (redemptions.data ?? []) as Array<{ promo_code_id: string; discount_amount: number | string }>) {
    const current = usage.get(row.promo_code_id) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total += Number(row.discount_amount);
    usage.set(row.promo_code_id, current);
  }

  return ((codes.data ?? []) as Array<PromoCodeRow & { created_at: string }>).map((row) => ({
    ...rowToPromo(row),
    createdAt: row.created_at,
    timesUsed: usage.get(row.id)?.count ?? 0,
    totalDiscount: Math.round((usage.get(row.id)?.total ?? 0) * 100) / 100
  }));
}
