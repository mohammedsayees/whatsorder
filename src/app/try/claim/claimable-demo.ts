import "server-only";

import { cookies } from "next/headers";

import {
  demoClaimCookieName,
  hashDemoClaimToken,
  parseDemoClaimCookie
} from "@/lib/demo-claim";
import { isCountryCode } from "@/lib/localization";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { CountryCode } from "@/lib/types";

export type ClaimableDemo = {
  id: string;
  name: string;
  slug: string;
  countryCode: CountryCode;
  claimToken: string;
};

// Resolves the demo restaurant this browser built, from the private httpOnly
// claim cookie. The token is checked against the stored hash (not just the
// restaurant id in the cookie) so nobody can read another demo's details by
// editing the cookie. The claim RPC re-checks everything atomically.
export async function getClaimableDemo(): Promise<ClaimableDemo | null> {
  const admin = getSupabaseAdmin();
  const cookieStore = await cookies();
  const claim = parseDemoClaimCookie(cookieStore.get(demoClaimCookieName)?.value);
  if (!admin || !claim) {
    return null;
  }

  const { data: proof } = await admin
    .from("demo_restaurant_claims")
    .select("restaurant_id, expires_at, claimed_at")
    .eq("restaurant_id", claim.restaurantId)
    .eq("claim_token_hash", hashDemoClaimToken(claim.token))
    .maybeSingle();

  if (!proof || proof.claimed_at || new Date(String(proof.expires_at)).getTime() <= Date.now()) {
    return null;
  }

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("id, name, slug, country_code")
    .eq("id", claim.restaurantId)
    .eq("is_demo", true)
    .maybeSingle();

  if (!restaurant) {
    return null;
  }

  return {
    id: String(restaurant.id),
    name: String(restaurant.name),
    slug: String(restaurant.slug),
    countryCode: isCountryCode(restaurant.country_code) ? restaurant.country_code : "AE",
    claimToken: claim.token
  };
}
