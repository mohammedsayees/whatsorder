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
  periods?: DailyPeriodInsight[];
  location_insights?: DailyLocationInsight[];
  coach?: DailyCoach;
};

export type DailyPeriodKey =
  | "early_morning"
  | "morning"
  | "lunch"
  | "evening"
  | "night"
  | "midnight";

export type DailyPeriodInsight = {
  key: DailyPeriodKey;
  label: string;
  start_hour: number;
  end_hour: number;
  order_count: number;
  sales: number;
  avg_order_value: number;
  baseline_order_count: number;
  baseline_avg_order_value: number;
  cancelled_count: number;
  contact_count: number;
  marketable_count: number;
  repeat_customer_orders: number;
  new_customer_orders: number;
  delivery_order_count: number;
  fulfilment_breakdown: Record<
    string,
    { orders: number; sales: number }
  >;
  top_item: { name: string; qty: number } | null;
  top_delivery_area: { area: string; orders: number; sales: number } | null;
};

export type DailyLocationInsight = {
  area: string;
  order_count: number;
  sales: number;
  avg_order_value: number;
  repeat_customer_orders: number;
};

export type DailyCoachPeriodStatus =
  | "growing"
  | "normal"
  | "needs_attention"
  | "insufficient_data";

export type DailyCoachAction = {
  period_key: DailyPeriodKey;
  period_label: string;
  priority: number;
  kind: "operations" | "demand" | "basket" | "retention" | "location" | "protect";
  evidence: string;
  action: string;
};

export type DailyCoachPeriod = DailyPeriodInsight & {
  is_open: boolean;
  status: DailyCoachPeriodStatus;
  evidence: string;
  action: string;
};

export type DailyCoach = {
  periods: DailyCoachPeriod[];
  top_actions: DailyCoachAction[];
};

export type DailyCoachRpcResult = {
  summary_date: string;
  completed_order_count: number;
  completed_sales: number;
  avg_order_value: number;
  previous_day_count: number;
  last_week_count: number;
  same_weekday_average: number;
  cancelled_count: number;
  contact_count: number;
  marketable_count: number;
  repeat_customer_orders: number;
  new_customer_orders: number;
  periods: DailyPeriodInsight[];
  location_insights: DailyLocationInsight[];
};
