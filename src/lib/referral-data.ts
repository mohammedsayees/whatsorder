// lib/referral-data.ts
//
// Server-side reads for the referral programme. The customer identity comes
// from the verified customer session, never from the request.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import { parseReferralSummary, type ReferralSummary } from "@/lib/referrals";

/** Never throws: an unavailable lookup reads as "no referral card". */
export async function loadReferralSummary(identity: {
  restaurantId: string;
  phone: string;
}): Promise<ReferralSummary | null> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return null;
  }
  const { data, error } = await admin.rpc("get_referral_summary", {
    p_restaurant_id: identity.restaurantId,
    p_phone: identity.phone
  });
  if (error) {
    console.error("WhatsOrder referral summary lookup failed", error.code);
    return null;
  }
  return parseReferralSummary(data);
}

/** Café-wide totals for the admin settings page. */
export async function loadReferralStats(restaurantId: string): Promise<{
  referrals: number;
  pointsIssued: number;
  pointsRedeemed: number;
}> {
  const empty = { referrals: 0, pointsIssued: 0, pointsRedeemed: 0 };
  const admin = getSupabaseAdmin();
  if (!admin) {
    return empty;
  }
  const [referrals, ledger] = await Promise.all([
    admin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", restaurantId),
    admin
      .from("referral_point_transactions")
      .select("type, points")
      .eq("restaurant_id", restaurantId)
  ]);
  if (referrals.error || ledger.error) {
    console.error("WhatsOrder referral stats lookup failed");
    return empty;
  }
  let pointsIssued = 0;
  let pointsRedeemed = 0;
  for (const row of ledger.data ?? []) {
    if (row.type === "earned") {
      pointsIssued += Number(row.points) || 0;
    } else {
      pointsRedeemed += Math.abs(Number(row.points) || 0);
    }
  }
  return { referrals: referrals.count ?? 0, pointsIssued, pointsRedeemed };
}
