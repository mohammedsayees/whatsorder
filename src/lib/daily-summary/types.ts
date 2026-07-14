// Shape of the deterministic numbers payload produced by the
// public.daily_summary_numbers(rid, target_day) SQL function. Every figure is
// computed in SQL; the TypeScript layer treats these as opaque and never
// recomputes or rounds them — the LLM narration must not alter them either.

export type DailyNumbers = {
  summary_date: string; // ISO date in the restaurant's timezone, e.g. "2026-06-25"
  order_count: number;
  gross_revenue: number;
  avg_order_value: number;
  prev_count: number;
  last_week_count: number;
  delta_vs_prev: number;
  delta_vs_last_week: number;
  // Same-weekday 4-week average order count — "slow for its weekday" context.
  dow_avg_count: number;
  cancelled_count: number;
  // Share of the day's orders that left a phone number (0..1), null on a 0-order
  // day. marketable_count is those reachable for marketing (phone + consent) —
  // any "message them" suggestion must be gated on marketable_count > 0.
  contact_capture_rate: number | null;
  marketable_count: number;
  top_item: { name: string; qty: number } | null;
  top_combo: { a: string; b: string; count: number } | null;
  // Biggest week-over-week menu movers by quantity (this 7 days vs the prior 7).
  item_riser: { name: string; this_week: number; prev_week: number } | null;
  item_faller: { name: string; this_week: number; prev_week: number } | null;
  // 7-day basket-size trend — aov_this_week below aov_prev_week = shrinking baskets.
  aov_this_week: number;
  aov_prev_week: number;
  busiest_hour: number | null;
  deadest_hour: number | null;
};
