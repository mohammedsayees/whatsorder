// Shape of the deterministic numbers payload produced by the
// public.daily_summary_numbers(rid, target_day) SQL function. Every figure is
// computed in SQL; the TypeScript layer treats these as opaque and never
// recomputes or rounds them — the LLM narration must not alter them either.

export type DailyNumbers = {
  summary_date: string; // ISO date (Asia/Dubai day reported), e.g. "2026-06-25"
  order_count: number;
  gross_revenue: number;
  avg_order_value: number;
  prev_count: number;
  last_week_count: number;
  delta_vs_prev: number;
  delta_vs_last_week: number;
  cancelled_count: number;
  top_item: { name: string; qty: number } | null;
  top_combo: { a: string; b: string; count: number } | null;
  busiest_hour: number | null;
  deadest_hour: number | null;
};
