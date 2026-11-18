import "server-only";

import { summarizeAttribution } from "@/lib/attribution-report";
import type { StoreOrderSourceSummary } from "@/components/admin/StoreShareKit";
import { getSupabaseAdmin } from "@/lib/supabase";

const SOURCE_WINDOW_DAYS = 30;

/**
 * Orders per attribution source for one restaurant over the last 30 days.
 * Always scoped by the session's restaurant id. Returns null (panel shows
 * "unavailable") rather than throwing, so the share kit never breaks.
 */
export async function getStoreOrderSourceSummary(
  restaurantId: string
): Promise<StoreOrderSourceSummary | null> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return null;
  }
  const since = new Date(Date.now() - SOURCE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("orders")
    .select("attribution_source")
    .eq("restaurant_id", restaurantId)
    .neq("status", "Cancelled")
    .gte("created_at", since)
    .limit(10000);
  if (error) {
    console.error("WhatsOrder share: order sources failed", error.code);
    return null;
  }
  const sources = ((data ?? []) as { attribution_source: string | null }[]).map(
    (row) => row.attribution_source
  );
  return {
    days: SOURCE_WINDOW_DAYS,
    total: sources.length,
    rows: summarizeAttribution(sources)
  };
}
