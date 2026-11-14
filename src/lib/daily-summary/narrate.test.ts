import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aedAmountsGrounded, buildTemplateMessage, narrate } from "./narrate";
import { withDailyCoach } from "./coach";
import type { DailyNumbers } from "./types";

function numbers(overrides: Partial<DailyNumbers> = {}): DailyNumbers {
  return {
    summary_date: "2026-06-25",
    order_count: 110,
    gross_revenue: 522.5,
    avg_order_value: 4.75,
    prev_count: 88,
    last_week_count: 0,
    delta_vs_prev: 22,
    delta_vs_last_week: 110,
    dow_avg_count: 90,
    cancelled_count: 1,
    contact_capture_rate: 0.15,
    marketable_count: 4,
    top_item: { name: "Karak Tea", qty: 73 },
    top_combo: { a: "cake", b: "Karak Tea", count: 5 },
    item_riser: { name: "Iced latte", this_week: 40, prev_week: 25 },
    item_faller: { name: "Samosa", this_week: 10, prev_week: 30 },
    aov_this_week: 4.9,
    aov_prev_week: 5.2,
    busiest_hour: 18,
    deadest_hour: 6,
    ...overrides
  };
}

describe("aedAmountsGrounded", () => {
  it("accepts text whose AED amounts match the computed figures", () => {
    const text = "You made AED 522.50 across 110 orders, average AED 4.75.";
    expect(aedAmountsGrounded(text, numbers())).toBe(true);
  });

  it("accepts thousands-separated formatting of a real figure", () => {
    const text = "Sales were AED 1,200.00 yesterday.";
    expect(aedAmountsGrounded(text, numbers({ gross_revenue: 1200 }))).toBe(true);
  });

  it("rejects a hallucinated money figure", () => {
    const text = "Great day — you earned AED 9,999 yesterday!";
    expect(aedAmountsGrounded(text, numbers())).toBe(false);
  });

  it("ignores non-AED numbers (counts, times) in the suggestion", () => {
    const text = "110 orders, AED 522.50. Try a 3-5pm offer to lift the 6:00 lull.";
    expect(aedAmountsGrounded(text, numbers())).toBe(true);
  });

  it("accepts the weekly basket-size figures (aov_this_week / aov_prev_week)", () => {
    const text = "Baskets softened from AED 5.20 to AED 4.90 this week.";
    expect(aedAmountsGrounded(text, numbers())).toBe(true);
  });

  it("accepts customer-credit amounts included in the owner report", () => {
    const n = numbers({
      credit: { outstanding: 125, overdue: 25, issued: 20, collected: 10 }
    });
    expect(aedAmountsGrounded("Customer credit: AED 125 outstanding; AED 25 overdue.", n)).toBe(true);
  });
});

describe("buildTemplateMessage", () => {
  it("renders an encouraging one-liner on a zero-order day", () => {
    const message = buildTemplateMessage(numbers({ order_count: 0 }), "Chai Xpress");
    expect(message).toContain("no completed orders");
    expect(message.split("\n")).toHaveLength(1);
  });

  it("keeps the operational facts AND ends with a growth action, staying AED-grounded", () => {
    const n = numbers();
    const message = buildTemplateMessage(n, "Chai Xpress");
    expect(message).toContain("110 orders");
    // Facts the owner runs the shop on are retained.
    expect(message).toContain("Karak Tea");
    expect(message).toContain("18:00");
    // ...and it closes on a real action — here the low contact-capture lever.
    expect(message).toContain("15%");
    expect(aedAmountsGrounded(message, n)).toBe(true);
  });

  it("uses the same-day-last-week comparison for the verdict when available", () => {
    const message = buildTemplateMessage(
      numbers({ last_week_count: 120, delta_vs_last_week: -10 }),
      "Chai Xpress"
    );
    expect(message).toContain("slower day");
    expect(message).toContain("same day last week");
  });

  it("lets a material cancellation count headline the action", () => {
    const message = buildTemplateMessage(numbers({ cancelled_count: 6 }), "Chai Xpress");
    expect(message).toContain("cancellations");
  });

  it("never lets a single trivial cancellation win the action", () => {
    const message = buildTemplateMessage(numbers({ cancelled_count: 1 }), "Chai Xpress");
    expect(message).not.toContain("cancellations");
  });

  it("defends a fading item once contacts are captured and there is no leak", () => {
    const message = buildTemplateMessage(
      numbers({ contact_capture_rate: 0.9, cancelled_count: 0 }),
      "Chai Xpress"
    );
    expect(message).toContain("Samosa");
    expect(message).toContain("sliding");
  });

  it("renders deterministic period priorities when Daily Coach data is present", () => {
    const n = withDailyCoach({
      ...numbers({
        order_count: 4,
        gross_revenue: 80,
        avg_order_value: 20,
        last_week_count: 8,
        delta_vs_last_week: -4,
        repeat_customer_orders: 2,
        top_items: [
          { name: "Karak Tea", qty: 4 },
          { name: "Samosa", qty: 2 }
        ],
        payment_breakdown: {
          "Cash on Delivery": { orders: 3, sales: 60 },
          "Card on Delivery": { orders: 1, sales: 20 }
        },
        credit: {
          outstanding: 125,
          overdue: 25,
          issued: 20,
          collected: 10
        }
      }),
      periods: [
        {
          key: "morning",
          label: "Morning",
          start_hour: 7,
          end_hour: 11,
          order_count: 4,
          sales: 80,
          avg_order_value: 20,
          baseline_order_count: 8,
          baseline_avg_order_value: 20,
          cancelled_count: 0,
          contact_count: 2,
          marketable_count: 1,
          repeat_customer_orders: 2,
          new_customer_orders: 0,
          delivery_order_count: 0,
          fulfilment_breakdown: {
            delivery: { orders: 3, sales: 60 },
            takeaway: { orders: 1, sales: 20 }
          },
          top_item: { name: "Karak Tea", qty: 4 },
          top_delivery_area: null
        }
      ]
    });
    const message = buildTemplateMessage(n, "Chai Xpress");
    expect(message).toContain("Daily Coach");
    expect(message).toContain("4 completed orders");
    expect(message).toContain("Order mix: Delivery: 3 • Takeaway: 1");
    expect(message).toContain("Payment mix: Cash: 3");
    expect(message).toContain("Card: 1");
    expect(message).toContain("Customer credit:");
    expect(message).toContain("125 outstanding");
    expect(message).toContain("25 overdue");
    expect(message).toContain("Top sellers: Karak Tea (4) • Samosa (2)");
    expect(message).toContain("Returning-customer orders: 2");
    expect(message).toContain("Morning:");
    expect(message).toContain("Today's priorities");
    expect(message).not.toContain("can't win back");
  });

  it("renders a zero-order alert with a dashboard link", () => {
    const previousUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com/";
    try {
      const n = withDailyCoach(numbers({ order_count: 0, gross_revenue: 0 }));
      const message = buildTemplateMessage(n, "Chai Xpress");
      expect(message).toContain("Alert: no completed sales");
      expect(message).toContain("Open dashboard: https://example.com/admin");
    } finally {
      if (previousUrl === undefined) {
        delete process.env.NEXT_PUBLIC_APP_URL;
      } else {
        process.env.NEXT_PUBLIC_APP_URL = previousUrl;
      }
    }
  });

  it("sends a neutral closed line instead of the alert on a scheduled closed day", () => {
    const closedHours = Object.fromEntries(
      ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
        (day) => [day, { closed: day === "thursday", open: "07:00", close: "23:00" }]
      )
    );
    const restaurant = { opening_hours_enabled: true, opening_hours: closedHours };
    // 2026-06-25 is a Thursday; Wednesday's hours do not run past midnight.
    const n = withDailyCoach(
      numbers({ order_count: 0, gross_revenue: 0, last_week_count: 30 }),
      restaurant
    );
    const message = buildTemplateMessage(n, "Chai Xpress", restaurant);
    expect(message).toContain("Closed per your opening hours");
    expect(message).not.toContain("Alert");
    expect(message).not.toContain("Comparison:");
  });

  it("keeps the zero-sales alert for a day that should have been open", () => {
    const openHours = Object.fromEntries(
      ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map(
        (day) => [day, { closed: false, open: "07:00", close: "23:00" }]
      )
    );
    const restaurant = { opening_hours_enabled: true, opening_hours: openHours };
    const n = withDailyCoach(numbers({ order_count: 0, gross_revenue: 0 }), restaurant);
    const message = buildTemplateMessage(n, "Chai Xpress", restaurant);
    expect(message).toContain("Alert: no completed sales");
    expect(message).not.toContain("Closed per your opening hours");
  });

  it("keeps the zero-sales alert when opening hours are not enabled", () => {
    const n = withDailyCoach(numbers({ order_count: 0, gross_revenue: 0 }));
    const message = buildTemplateMessage(n, "Chai Xpress", { opening_hours_enabled: false });
    expect(message).toContain("Alert: no completed sales");
  });

  it("shows unfinished orders and renders day-level actions without a period label", () => {
    const n = withDailyCoach(
      numbers({
        order_count: 4,
        unfinished_order_count: 2,
        periods: []
      })
    );
    const message = buildTemplateMessage(n, "Chai Xpress");
    expect(message).toContain("Unfinished: 2");
    expect(message).toContain(
      "1. 2 orders from the day were never completed or cancelled"
    );
    expect(message).not.toContain("null");
    expect(message).not.toContain("undefined");
  });

  it("shows unfinished orders on a zero-completed day", () => {
    const n = withDailyCoach(
      numbers({ order_count: 0, gross_revenue: 0, unfinished_order_count: 1 })
    );
    const message = buildTemplateMessage(n, "Chai Xpress");
    expect(message).toContain("Unfinished: 1 order was never completed or cancelled");
  });

  it("explains thin history for a new restaurant instead of inventing a trend", () => {
    const n = withDailyCoach(
      numbers({
        order_count: 9,
        last_week_count: 0,
        dow_avg_count: 0,
        dow_trading_days: 0,
        top_combo: null,
        item_riser: null,
        item_faller: null,
        periods: [
          {
            key: "morning",
            label: "Morning",
            start_hour: 7,
            end_hour: 11,
            order_count: 9,
            sales: 180,
            avg_order_value: 20,
            baseline_order_count: 0,
            baseline_avg_order_value: 0,
            baseline_trading_days: 0,
            cancelled_count: 0,
            contact_count: 9,
            marketable_count: 3,
            repeat_customer_orders: 0,
            new_customer_orders: 9,
            delivery_order_count: 0,
            checkout_order_count: 9,
            checkout_contact_count: 9,
            fulfilment_breakdown: { takeaway: { orders: 9, sales: 180 } },
            top_item: { name: "Karak Tea", qty: 9 },
            top_delivery_area: null
          }
        ]
      })
    );
    const message = buildTemplateMessage(n, "Chai Xpress");
    expect(message).not.toContain("Comparison:");
    expect(message).toContain("not enough same-weekday trading history");
  });

  it("names the trading days behind a same-weekday average comparison", () => {
    const n = withDailyCoach(
      numbers({ last_week_count: 0, dow_avg_count: 100, dow_trading_days: 3, periods: [] })
    );
    expect(buildTemplateMessage(n, "Chai Xpress")).toContain(
      "than the same-weekday average (3 trading days)"
    );
  });
});

describe("narrate (fallback behaviour)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
  });

  it("returns the model text when the call succeeds and figures are grounded", async () => {
    const n = numbers();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Solid day: 110 orders, AED 522.50 in sales." }] } }]
      })
    }) as unknown as typeof fetch;

    const message = await narrate(n, "Chai Xpress");
    expect(message).toBe("Solid day: 110 orders, AED 522.50 in sales.");
  });

  it("falls back to the template when the model invents a figure", async () => {
    const n = numbers();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Amazing — AED 9,999 in sales!" }] } }]
      })
    }) as unknown as typeof fetch;

    const message = await narrate(n, "Chai Xpress");
    expect(message).toBe(buildTemplateMessage(n, "Chai Xpress"));
  });

  it("falls back to the template when the API errors", async () => {
    const n = numbers();
    // Non-retryable status -> throws immediately, no backoff sleeps.
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "bad request"
    }) as unknown as typeof fetch;

    const message = await narrate(n, "Chai Xpress");
    expect(message).toBe(buildTemplateMessage(n, "Chai Xpress"));
  });

  it("falls back to the template when no API key is configured", async () => {
    delete process.env.GEMINI_API_KEY;
    const n = numbers();
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const message = await narrate(n, "Chai Xpress");
    expect(message).toBe(buildTemplateMessage(n, "Chai Xpress"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
