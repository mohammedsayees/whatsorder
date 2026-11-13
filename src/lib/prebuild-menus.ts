import "server-only";

import { STORE_SLUG_PATTERN } from "@/lib/store-slug";
import { getSupabaseAdmin } from "@/lib/supabase";

// Slugs to pre-render /r/[slug] for at build time, so the first visitor after
// a deploy gets the edge-cached menu instead of a cold origin render.
//
// This is only a build-time hint. Access is still decided per page by
// get_public_restaurant (is_public_restaurant: is_active and status in
// live/trial/paid); the filter below mirrors it so we don't pre-render 404s.
// Any failure (no service key, dummy CI env, slow DB) returns [] so the build
// never fails or hangs; pages then render on first request as before.
export const PREBUILD_MENU_LIMIT = 500;
export const PREBUILD_LOOKUP_TIMEOUT_MS = 5_000;
const PUBLIC_STATUSES = ["live", "trial", "paid"];

export async function getPrebuildRestaurantSlugs(): Promise<string[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  try {
    const { data, error } = await admin
      .from("restaurants")
      .select("slug")
      .eq("is_active", true)
      .in("status", PUBLIC_STATUSES)
      .order("slug")
      .limit(PREBUILD_MENU_LIMIT)
      .abortSignal(AbortSignal.timeout(PREBUILD_LOOKUP_TIMEOUT_MS));
    if (error || !data) return [];
    return data
      .map((row) => String(row.slug ?? "").trim())
      .filter((slug) => STORE_SLUG_PATTERN.test(slug));
  } catch {
    return [];
  }
}
