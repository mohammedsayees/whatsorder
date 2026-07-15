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
        delta_vs_last_week: -4
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
          fulfilment_breakdown: {},
          top_item: { name: "Karak Tea", qty: 4 },
          top_delivery_area: null
        }
      ]
    });
    const message = buildTemplateMessage(n, "Chai Xpress");
    expect(message).toContain("Daily Coach");
    expect(message).toContain("4 completed orders");
    expect(message).toContain("Morning:");
    expect(message).toContain("Today's priorities");
    expect(message).not.toContain("can't win back");
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
