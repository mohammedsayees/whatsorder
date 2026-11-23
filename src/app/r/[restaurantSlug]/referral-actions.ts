"use server";

// Customer-side referral actions. Each one re-resolves the signed session for
// the café named by the slug and acts ONLY on the (restaurant, phone) it
// carries; nothing the browser sends can widen that scope.

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug } from "@/lib/data";
import { resolveCustomerSession } from "@/lib/customer-auth/session";
import { getSupabaseAdmin } from "@/lib/supabase";

async function signedInCustomer(restaurantSlug: string) {
  const restaurant = await getRestaurantBySlug(String(restaurantSlug ?? ""));
  if (!restaurant) {
    return null;
  }
  const session = await resolveCustomerSession(restaurant.id);
  if (session.status !== "signed_in") {
    return null;
  }
  return { restaurant, phone: session.identity.phone };
}

/**
 * The signed-in customer's personal share code, or null (signed out, no past
 * order, or the café has the programme off) — the caller then shares the plain
 * link.
 */
export async function getShareReferralAction(
  restaurantSlug: string
): Promise<{ code: string; pointsEach: number } | null> {
  const customer = await signedInCustomer(restaurantSlug);
  const admin = getSupabaseAdmin();
  if (!customer || !admin) {
    return null;
  }
  const { data, error } = await admin.rpc("get_or_create_referral_code", {
    p_restaurant_id: customer.restaurant.id,
    p_phone: customer.phone
  });
  if (error || !data || typeof data !== "object") {
    return null;
  }
  const result = data as { enabled?: boolean; code?: unknown; points_each?: unknown };
  if (!result.enabled || typeof result.code !== "string") {
    return null;
  }
  return { code: result.code, pointsEach: Math.max(1, Math.floor(Number(result.points_each) || 20)) };
}

export type RedeemReferralResult =
  | { ok: true; code: string; value: number }
  | { ok: false; error: "signed_out" | "not_enough_points" | "failed" };

/** Spends the café's configured number of points on a one-time personal voucher. */
export async function redeemReferralPointsAction(
  restaurantSlug: string
): Promise<RedeemReferralResult> {
  const customer = await signedInCustomer(restaurantSlug);
  if (!customer) {
    return { ok: false, error: "signed_out" };
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: "failed" };
  }
  const { data, error } = await admin.rpc("redeem_referral_points", {
    p_restaurant_id: customer.restaurant.id,
    p_phone: customer.phone
  });
  if (error) {
    if (error.message.includes("Not enough points")) {
      return { ok: false, error: "not_enough_points" };
    }
    console.error("WhatsOrder referral redemption failed", error.code);
    return { ok: false, error: "failed" };
  }
  const result = data as { code?: unknown; value?: unknown } | null;
  if (!result || typeof result.code !== "string") {
    return { ok: false, error: "failed" };
  }
  revalidatePath(`/r/${customer.restaurant.slug}/account`);
  return { ok: true, code: result.code, value: Number(result.value) || 0 };
}
