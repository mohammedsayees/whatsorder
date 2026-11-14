import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  DailyCoachRpcResult,
  DailyNumbers,
  DailyOwnerReportRpcResult
} from "./types";

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
  const [summaryResult, coachResult, ownerReportResult] = targetDay
    ? await Promise.all([
        summaryPromise,
        admin.rpc("daily_coach_insights", {
          rid: restaurantId,
          target_day: targetDay
        }),
        admin.rpc("daily_owner_report_insights", {
          rid: restaurantId,
          target_day: targetDay
        })
      ])
    : await (async () => {
        const summary = await summaryPromise;
        const summaryDate = (summary.data as { summary_date?: string } | null)
          ?.summary_date;
        if (!summaryDate) {
          const missing = { data: null, error: new Error("Missing summary date") };
          return [summary, missing, missing] as const;
        }
        const [coach, ownerReport] = await Promise.all([
          admin.rpc("daily_coach_insights", {
            rid: restaurantId,
            target_day: summaryDate
          }),
          admin.rpc("daily_owner_report_insights", {
            rid: restaurantId,
            target_day: summaryDate
          })
        ]);
        return [summary, coach, ownerReport] as const;
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
  if (ownerReportResult.error) {
    throw new Error(
      `daily_owner_report_insights failed: ${ownerReportResult.error.message}`
    );
  }
  if (!ownerReportResult.data) {
    throw new Error("daily_owner_report_insights returned no data");
  }

  const legacy = summaryResult.data as DailyNumbers;
  const coach = coachResult.data as DailyCoachRpcResult;
  const ownerReport = ownerReportResult.data as DailyOwnerReportRpcResult;
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
    // Optional until the trading-day migration is applied; undefined is
    // handled by the coach and message builder.
    dow_trading_days: coach.same_weekday_trading_days,
    cancelled_count: coach.cancelled_count,
    unfinished_order_count: coach.unfinished_order_count ?? 0,
    contact_capture_rate: contactCaptureRate,
    marketable_count: coach.marketable_count,
    repeat_customer_orders: coach.repeat_customer_orders,
    new_customer_orders: coach.new_customer_orders,
    top_items: ownerReport.top_items,
    payment_breakdown: ownerReport.payment_breakdown,
    credit: ownerReport.credit,
    periods: coach.periods,
    location_insights: coach.location_insights
  };
}
