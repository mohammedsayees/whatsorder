// Monthly AI image allowance (pricing v2). Every paid image generation — menu
// editor photos and poster artwork — counts against one per-restaurant
// allowance per UAE calendar month. The per-feature daily caps still apply on
// top of this. Server-only: reads the service-role ai_image_generations log.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/** Start of the current UAE (UTC+4, no DST) calendar month as an ISO instant. */
export function uaeMonthStartIso(now = Date.now()): string {
  const month = new Date(now + 4 * 60 * 60 * 1000).toISOString().slice(0, 7);
  return new Date(`${month}-01T00:00:00+04:00`).toISOString();
}

/** Non-failed AI images this UAE month, or null when usage can't be read. */
export async function aiImagesUsedThisMonth(
  admin: Admin,
  restaurantId: string,
  now = Date.now()
): Promise<number | null> {
  const { count, error } = await admin
    .from("ai_image_generations")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .neq("status", "failed")
    .gte("created_at", uaeMonthStartIso(now));
  if (error) {
    console.error("WhatsOrder AI image allowance: usage read failed", error.code);
    return null;
  }
  return count ?? 0;
}

export function aiImageAllowanceMessage(limit: number): string {
  return `You've used this month's ${limit} AI images on your plan. Upgrade to Growth for more, or wait until next month.`;
}
