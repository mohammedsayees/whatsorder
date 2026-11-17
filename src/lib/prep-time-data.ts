import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import {
  PREP_WINDOW_DAYS,
  computePrepEstimate,
  type PrepEstimate,
  type PrepEvent
} from "@/lib/prep-time";

const MAX_EVENTS = 6000;

/**
 * The restaurant's measured prep time over the last four weeks, or null when
 * there is not enough history (new stores, demo mode, or a read failure).
 * Callers render nothing for null: an estimate is never invented.
 *
 * Reads only this restaurant's status events (statuses and times), via the
 * service-role client on the server.
 */
export async function getRestaurantPrepEstimate(
  restaurantId: string,
  now: Date = new Date()
): Promise<PrepEstimate | null> {
  const admin = getSupabaseAdmin();

  if (!admin) {
    return null;
  }

  const since = new Date(now.getTime() - PREP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data, error } = await admin
      .from("order_status_events")
      .select("order_id,to_status,created_at")
      .eq("restaurant_id", restaurantId)
      .in("to_status", ["Accepted", "Ready to Serve", "Out for Delivery"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTS)
      .abortSignal(AbortSignal.timeout(4000));

    if (error || !data) {
      return null;
    }

    return computePrepEstimate(data as PrepEvent[]);
  } catch {
    return null;
  }
}
