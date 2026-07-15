import { describe, expect, it } from "vitest";

import { buildDailyCoach, isDailyPeriodOpen, withDailyCoach } from "./coach";
import type { DailyNumbers, DailyPeriodInsight } from "./types";

function period(
  key: DailyPeriodInsight["key"],
  label: string,
  overrides: Partial<DailyPeriodInsight> = {}
): DailyPeriodInsight {
  const hours = {
    early_morning: [4, 7],
    morning: [7, 11],
    lunch: [11, 15],
    evening: [15, 19],
    night: [19, 24],
    midnight: [0, 4]
  }[key];
  return {
    key,
    label,
    start_hour: hours[0],
    end_hour: hours[1],
    order_count: 6,
    sales: 120,
    avg_order_value: 20,
    baseline_order_count: 6,
    baseline_avg_order_value: 20,
    cancelled_count: 0,
    contact_count: 6,
    marketable_count: 2,
    repeat_customer_orders: 2,
    new_customer_orders: 4,
    delivery_order_count: 0,
    fulfilment_breakdown: {},
    top_item: { name: "Karak Tea", qty: 5 },
    top_delivery_area: null,
    ...overrides
  };
}

function numbers(periods: DailyPeriodInsight[]): DailyNumbers {
  return {
    summary_date: "2026-07-13",
    order_count: 12,
    gross_revenue: 240,
    avg_order_value: 20,
    prev_count: 10,
    last_week_count: 14,
    delta_vs_prev: 2,
    delta_vs_last_week: -2,
    dow_avg_count: 13,
    cancelled_count: 0,
    contact_capture_rate: 0.5,
    marketable_count: 2,
    top_item: { name: "Karak Tea", qty: 8 },
    top_combo: null,
    item_riser: null,
    item_faller: null,
    aov_this_week: 20,
    aov_prev_week: 20,
    busiest_hour: 19,
    deadest_hour: 3,
    periods
  };
}

const mondayHours = {
  monday: { closed: false, open: "07:00", close: "23:00" },
  tuesday: { closed: true, open: "07:00", close: "23:00" },
  wednesday: { closed: true, open: "07:00", close: "23:00" },
  thursday: { closed: true, open: "07:00", close: "23:00" },
  friday: { closed: true, open: "07:00", close: "23:00" },
  saturday: { closed: true, open: "07:00", close: "23:00" },
  sunday: { closed: true, open: "07:00", close: "23:00" }
};

describe("isDailyPeriodOpen", () => {
  it("suppresses periods outside configured trading hours", () => {
    const restaurant = {
      opening_hours_enabled: true,
      opening_hours: mondayHours
    };
    expect(isDailyPeriodOpen("early_morning", "2026-07-13", restaurant)).toBe(false);
    expect(isDailyPeriodOpen("morning", "2026-07-13", restaurant)).toBe(true);
    expect(isDailyPeriodOpen("midnight", "2026-07-13", restaurant)).toBe(false);
  });

  it("recognizes the previous day's overnight hours", () => {
    const restaurant = {
      opening_hours_enabled: true,
      opening_hours: {
        ...mondayHours,
        sunday: { closed: false, open: "20:00", close: "02:00" }
      }
    };
    expect(isDailyPeriodOpen("midnight", "2026-07-13", restaurant)).toBe(true);
  });
});

describe("buildDailyCoach", () => {
  it("prioritizes operational leaks before growth recommendations", () => {
    const coach = buildDailyCoach(
      numbers([
        period("morning", "Morning", { cancelled_count: 3, order_count: 8 }),
        period("lunch", "Lunch", { order_count: 2, baseline_order_count: 8 })
      ])
    );
    expect(coach.top_actions[0]).toMatchObject({
      period_key: "morning",
      kind: "operations"
    });
  });

  it("uses privacy-safe location evidence for a weak period", () => {
    const coach = buildDailyCoach(
      numbers([
        period("lunch", "Lunch", {
          order_count: 2,
          baseline_order_count: 8,
          delivery_order_count: 3,
          top_delivery_area: { area: "Al Rawda 3", orders: 3, sales: 60 }
        })
      ])
    );
    expect(coach.top_actions[0].evidence).toContain("Al Rawda 3");
    expect(coach.top_actions[0].action).toContain("avoid a broad discount");
  });

  it("keeps marketing consent separate in low-contact advice", () => {
    const coach = buildDailyCoach(
      numbers([
        period("evening", "Evening", {
          order_count: 10,
          contact_count: 2,
          marketable_count: 0
        })
      ])
    );
    expect(coach.top_actions[0].action).toContain("consent separate and optional");
    expect(coach.top_actions[0].action).not.toContain("message");
  });

  it("does not recommend discounting an already-growing period", () => {
    const coach = buildDailyCoach(
      numbers([
        period("night", "Night", {
          order_count: 12,
          baseline_order_count: 6
        })
      ])
    );
    expect(coach.periods[0].status).toBe("growing");
    expect(coach.top_actions[0].action).toContain("no discount is needed");
  });

  it("removes closed empty periods from the coach", () => {
    const enriched = withDailyCoach(
      numbers([
        period("early_morning", "Early morning", {
          order_count: 0,
          baseline_order_count: 0
        }),
        period("morning", "Morning")
      ]),
      { opening_hours_enabled: true, opening_hours: mondayHours }
    );
    expect(enriched.coach?.periods.map((entry) => entry.key)).toEqual(["morning"]);
  });

  it("flags completed orders outside configured opening hours", () => {
    const coach = buildDailyCoach(
      numbers([period("midnight", "Midnight", { order_count: 2 })]),
      { opening_hours_enabled: true, opening_hours: mondayHours }
    );
    expect(coach.periods[0].status).toBe("needs_attention");
    expect(coach.top_actions[0]).toMatchObject({ kind: "operations", priority: 110 });
    expect(coach.top_actions[0].evidence).toContain("outside configured opening hours");
  });
});
