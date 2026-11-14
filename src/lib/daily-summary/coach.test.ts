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
          marketable_count: 0,
          checkout_order_count: 10,
          checkout_contact_count: 2
        })
      ])
    );
    expect(coach.top_actions[0].action).toContain("consent separate and optional");
    expect(coach.top_actions[0].evidence).toContain("2 of 10 checkout orders");
    expect(coach.top_actions[0].action).not.toContain("message");
  });

  it("does not ask for loyalty capture because of walk-in or staff-entered orders", () => {
    const coach = buildDailyCoach(
      numbers([
        period("evening", "Evening", {
          order_count: 10,
          contact_count: 1,
          // Nine counter orders without a phone; the one checkout had one.
          checkout_order_count: 1,
          checkout_contact_count: 1
        })
      ])
    );
    expect(coach.top_actions.map((entry) => entry.kind)).not.toContain("retention");
  });

  it("skips contact-capture advice when checkout counts are missing from the payload", () => {
    const coach = buildDailyCoach(
      numbers([period("evening", "Evening", { order_count: 10, contact_count: 1 })])
    );
    expect(
      coach.top_actions.some((entry) => entry.action.includes("loyalty"))
    ).toBe(false);
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

describe("baseline evidence", () => {
  it("treats a restaurant with one week of history as insufficient data", () => {
    const coach = buildDailyCoach(
      numbers([
        // Last week was the only trading day: the baseline equals last week.
        period("morning", "Morning", {
          order_count: 12,
          baseline_order_count: 6,
          baseline_trading_days: 1
        }),
        period("lunch", "Lunch", {
          order_count: 2,
          baseline_order_count: 8,
          baseline_trading_days: 1
        })
      ])
    );
    expect(coach.periods.map((entry) => entry.status)).toEqual([
      "insufficient_data",
      "insufficient_data"
    ]);
    expect(coach.periods[0].evidence).toContain("only 1 trading day");
    expect(coach.top_actions).toEqual([]);
  });

  it("does not flag a baseline of 2 against one order", () => {
    const coach = buildDailyCoach(
      numbers([
        period("lunch", "Lunch", {
          order_count: 1,
          baseline_order_count: 2,
          baseline_trading_days: 4,
          top_item: null
        })
      ])
    );
    expect(coach.periods[0].status).toBe("normal");
    expect(coach.top_actions).toEqual([]);
  });

  it("requires a two-order gap before calling a period growing", () => {
    const coach = buildDailyCoach(
      numbers([
        period("lunch", "Lunch", {
          order_count: 3,
          baseline_order_count: 2,
          baseline_trading_days: 3
        })
      ])
    );
    expect(coach.periods[0].status).toBe("normal");
  });

  it("still flags a real drop once two trading days support the baseline", () => {
    const coach = buildDailyCoach(
      numbers([
        period("lunch", "Lunch", {
          order_count: 2,
          baseline_order_count: 8,
          baseline_trading_days: 2
        })
      ])
    );
    expect(coach.periods[0].status).toBe("needs_attention");
    expect(coach.top_actions[0]).toMatchObject({ kind: "demand", period_key: "lunch" });
  });

  it("still reports cancellations when the baseline is too thin", () => {
    const coach = buildDailyCoach(
      numbers([
        period("lunch", "Lunch", {
          order_count: 6,
          cancelled_count: 3,
          baseline_trading_days: 0
        })
      ])
    );
    expect(coach.periods[0].status).toBe("needs_attention");
    expect(coach.top_actions[0].kind).toBe("operations");
  });
});

describe("day-level actions", () => {
  const steady = () => [period("morning", "Morning", { baseline_trading_days: 4 })];

  it("raises unfinished orders as a day-level operations action", () => {
    const coach = buildDailyCoach({
      ...numbers(steady()),
      unfinished_order_count: 3,
      item_riser: { name: "Iced Latte", this_week: 20, prev_week: 10 }
    });
    expect(coach.top_actions[0]).toMatchObject({
      kind: "operations",
      period_key: null,
      period_label: null,
      priority: 105
    });
    expect(coach.top_actions[0].evidence).toContain("3 orders");
    expect(coach.top_actions[0].action).toContain("Close out or cancel");
  });

  it("ignores a missing unfinished count", () => {
    const coach = buildDailyCoach(numbers(steady()));
    expect(coach.top_actions.some((entry) => entry.kind === "operations")).toBe(false);
  });

  it("suggests featuring or retiring a falling item", () => {
    const coach = buildDailyCoach({
      ...numbers(steady()),
      item_faller: { name: "Samosa", this_week: 4, prev_week: 12 }
    });
    expect(coach.top_actions[0]).toMatchObject({ kind: "menu", period_key: null });
    expect(coach.top_actions[0].evidence).toContain("down from 12");
    expect(coach.top_actions[0].action).toContain("retire it");
  });

  it("ignores a fall from 2 to 1 units", () => {
    const coach = buildDailyCoach({
      ...numbers(steady()),
      item_faller: { name: "Samosa", this_week: 1, prev_week: 2 }
    });
    expect(coach.top_actions).toEqual([]);
  });

  it("makes a rising item the hero", () => {
    const coach = buildDailyCoach({
      ...numbers(steady()),
      item_riser: { name: "Iced Latte", this_week: 18, prev_week: 9 }
    });
    expect(coach.top_actions[0]).toMatchObject({ kind: "menu", period_key: null });
    expect(coach.top_actions[0].action).toContain("Make Iced Latte the hero");
  });

  it("does not call an item rising when it had no sales the week before", () => {
    const coach = buildDailyCoach({
      ...numbers(steady()),
      item_riser: { name: "Karak Tea", this_week: 70, prev_week: 0 }
    });
    expect(coach.top_actions).toEqual([]);
  });

  it("ignores a small rise", () => {
    const coach = buildDailyCoach({
      ...numbers(steady()),
      item_riser: { name: "Iced Latte", this_week: 4, prev_week: 2 }
    });
    expect(coach.top_actions).toEqual([]);
  });

  it("turns a frequent pairing into a named combo", () => {
    const coach = buildDailyCoach({
      ...numbers(steady()),
      top_combo: { a: "Cake", b: "Karak Tea", count: 5 }
    });
    expect(coach.top_actions[0]).toMatchObject({
      kind: "basket",
      period_key: null,
      priority: 54
    });
    expect(coach.top_actions[0].action).toContain("Cake + Karak Tea");
  });

  it("ranks the combo higher when weekly order value is falling", () => {
    const coach = buildDailyCoach({
      ...numbers(steady()),
      top_combo: { a: "Cake", b: "Karak Tea", count: 5 },
      item_faller: { name: "Samosa", this_week: 4, prev_week: 12 },
      aov_this_week: 18,
      aov_prev_week: 20
    });
    expect(coach.top_actions[0]).toMatchObject({ kind: "basket", priority: 78 });
    expect(coach.top_actions[0].evidence).toContain("Average order value is down");
    expect(coach.top_actions[1].kind).toBe("menu");
  });

  it("ignores a pairing seen in fewer than three orders", () => {
    const coach = buildDailyCoach({
      ...numbers(steady()),
      top_combo: { a: "Cake", b: "Karak Tea", count: 2 }
    });
    expect(coach.top_actions).toEqual([]);
  });

  it("keeps operational problems above growth ideas without making all three the same kind", () => {
    const coach = buildDailyCoach(
      {
        ...numbers([
          period("midnight", "Midnight", { order_count: 2 }),
          period("morning", "Morning", { cancelled_count: 3, order_count: 8 })
        ]),
        unfinished_order_count: 2,
        top_combo: { a: "Cake", b: "Karak Tea", count: 5 },
        aov_this_week: 18,
        aov_prev_week: 20,
        item_riser: { name: "Iced Latte", this_week: 18, prev_week: 9 }
      },
      { opening_hours_enabled: true, opening_hours: mondayHours }
    );
    expect(coach.top_actions.map((entry) => [entry.kind, entry.priority])).toEqual([
      ["operations", 110],
      ["operations", 105],
      ["basket", 78]
    ]);
  });

  it("lets day-level and period actions compete for the same three slots", () => {
    const coach = buildDailyCoach({
      ...numbers([
        period("lunch", "Lunch", {
          order_count: 2,
          baseline_order_count: 8,
          baseline_trading_days: 4
        })
      ]),
      item_faller: { name: "Samosa", this_week: 4, prev_week: 12 },
      item_riser: { name: "Iced Latte", this_week: 18, prev_week: 9 },
      top_combo: { a: "Cake", b: "Karak Tea", count: 5 }
    });
    expect(coach.top_actions.map((entry) => entry.priority)).toEqual([90, 58, 54]);
    expect(coach.top_actions[0].period_key).toBe("lunch");
  });
});
