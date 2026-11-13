// lib/slug-history.ts
//
// A restaurant that renames its store link keeps the old one
// (restaurant_slug_history, enforced by a database trigger). Old printed QR
// codes and shared links redirect to the current link instead of 404ing.
// Only called when a slug matches no restaurant, so normal menu requests pay
// nothing.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

export async function currentSlugForReleasedSlug(slug: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin || !/^[a-z0-9-]{1,80}$/.test(slug)) {
    return null;
  }
  const { data: history, error } = await admin
    .from("restaurant_slug_history")
    .select("restaurant_id")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !history) {
    return null;
  }
  const { data: restaurant } = await admin
    .from("restaurants")
    .select("slug")
    .eq("id", (history as { restaurant_id: string }).restaurant_id)
    .eq("is_active", true)
    .maybeSingle();
  const current = (restaurant as { slug?: string } | null)?.slug;
  return current && current !== slug ? current : null;
}
