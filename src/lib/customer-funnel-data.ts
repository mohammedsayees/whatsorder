import "server-only";

import { buildFunnel } from "@/lib/customer-funnel";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Ordering funnel for one restaurant and date range. Callers must pass the
 * restaurant id from the verified admin session (never from the request),
 * because the summary RPC runs with the service role.
 */
export async function getCustomerFunnel(
  restaurantId: string,
  rangeStartIso: string,
  rangeEndExclusiveIso: string
) {
  const admin = getSupabaseAdmin();

  if (!admin) {
    return null;
  }

  const { data, error } = await admin.rpc("customer_funnel_summary", {
    target_restaurant_id: restaurantId,
    range_start: rangeStartIso,
    range_end: rangeEndExclusiveIso
  });

  if (error || !Array.isArray(data)) {
    return null;
  }

  return buildFunnel(data as { event_name: string; sessions: number | string }[]);
}
