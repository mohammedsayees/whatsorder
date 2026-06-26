import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DailyNumbers } from "./types";

/**
 * Returns yesterday's deterministic numbers for one restaurant by delegating to
 * the public.daily_summary_numbers SQL function. ALL figures are computed in
 * Postgres — this layer only forwards the restaurant id (and an optional target
 * day for spot-checking a known past date) and returns the jsonb verbatim.
 *
 * The query is explicitly scoped to `rid` inside the SQL function. The cron job
 * runs with the service role (RLS bypassed), so explicit scoping is the only
 * tenant guard — never aggregate across restaurants here.
 */
export async function computeDailyNumbers(
  admin: SupabaseClient,
  restaurantId: string,
  targetDay?: string
): Promise<DailyNumbers> {
  const params: { rid: string; target_day?: string } = { rid: restaurantId };
  if (targetDay) {
    params.target_day = targetDay;
  }

  const { data, error } = await admin.rpc("daily_summary_numbers", params);

  if (error) {
    throw new Error(`daily_summary_numbers failed: ${error.message}`);
  }
  if (!data) {
    throw new Error("daily_summary_numbers returned no data");
  }

  return data as DailyNumbers;
}
