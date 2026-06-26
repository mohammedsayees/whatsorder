import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { aedAmountsGrounded, buildTemplateMessage, narrate } from "./narrate";
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
    cancelled_count: 1,
    top_item: { name: "Karak Tea", qty: 73 },
    top_combo: { a: "cake", b: "Karak Tea", count: 5 },
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
});

describe("buildTemplateMessage", () => {
  it("renders an encouraging one-liner on a zero-order day", () => {
    const message = buildTemplateMessage(numbers({ order_count: 0 }), "Chai Xpress");
    expect(message).toContain("0 orders");
    expect(message.split("\n")).toHaveLength(1);
  });

  it("includes only grounded figures and stays AED-grounded", () => {
    const n = numbers();
    const message = buildTemplateMessage(n, "Chai Xpress");
    expect(message).toContain("110 orders");
    expect(message).toContain("Karak Tea");
    expect(aedAmountsGrounded(message, n)).toBe(true);
  });

  it("omits the combo and cancellation lines when absent", () => {
    const message = buildTemplateMessage(
      numbers({ top_combo: null, cancelled_count: 0 }),
      "Chai Xpress"
    );
    expect(message).not.toContain("ordered together");
    expect(message).not.toContain("cancelled");
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
