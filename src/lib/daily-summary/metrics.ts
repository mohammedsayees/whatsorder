import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DailyCoachRpcResult, DailyNumbers } from "./types";

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

  const summaryPromise = admin.rpc("daily_summary_numbers", params);
  const [summaryResult, coachResult] = targetDay
    ? await Promise.all([
        summaryPromise,
        admin.rpc("daily_coach_insights", {
          rid: restaurantId,
          target_day: targetDay
        })
      ])
    : await (async () => {
        const summary = await summaryPromise;
        const summaryDate = (summary.data as { summary_date?: string } | null)
          ?.summary_date;
        if (!summaryDate) {
          return [summary, { data: null, error: new Error("Missing summary date") }] as const;
        }
        const coach = await admin.rpc("daily_coach_insights", {
          rid: restaurantId,
          target_day: summaryDate
        });
        return [summary, coach] as const;
      })();

  if (summaryResult.error) {
    throw new Error(`daily_summary_numbers failed: ${summaryResult.error.message}`);
  }
  if (!summaryResult.data) {
    throw new Error("daily_summary_numbers returned no data");
  }
  if (coachResult.error) {
    throw new Error(`daily_coach_insights failed: ${coachResult.error.message}`);
  }
  if (!coachResult.data) {
    throw new Error("daily_coach_insights returned no data");
  }

  const legacy = summaryResult.data as DailyNumbers;
  const coach = coachResult.data as DailyCoachRpcResult;
  const contactCaptureRate =
    coach.completed_order_count > 0
      ? coach.contact_count / coach.completed_order_count
      : null;

  return {
    ...legacy,
    summary_date: coach.summary_date,
    order_count: coach.completed_order_count,
    gross_revenue: coach.completed_sales,
    avg_order_value: coach.avg_order_value,
    prev_count: coach.previous_day_count,
    last_week_count: coach.last_week_count,
    delta_vs_prev: coach.completed_order_count - coach.previous_day_count,
    delta_vs_last_week: coach.completed_order_count - coach.last_week_count,
    dow_avg_count: coach.same_weekday_average,
    cancelled_count: coach.cancelled_count,
    contact_capture_rate: contactCaptureRate,
    marketable_count: coach.marketable_count,
    periods: coach.periods,
    location_insights: coach.location_insights
  };
}
