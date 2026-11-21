import { describe, expect, it } from "vitest";
import { AI_FEATURES } from "./usage";
import { AI_FEATURE_LABELS, formatUsd, summarizeAiUsage } from "./usage-data";

const row = (restaurant_id: string | null, feature: string, calls: number, cost: number, unpriced = 0) => ({
  restaurant_id,
  feature,
  calls,
  input_tokens: 0,
  output_tokens: 0,
  thinking_tokens: 0,
  estimated_cost_usd: cost,
  unpriced_calls: unpriced
});

describe("summarizeAiUsage", () => {
  it("totals each restaurant, most expensive first, with features by cost", () => {
    const summary = summarizeAiUsage([
      row("cheap", "chatbot_reply", 40, 0.12),
      row("pricey", "chatbot_reply", 10, 0.03),
      row("pricey", "menu_image", 20, 0.78, 1),
      row(null, "menu_extract", 3, 0.01)
    ]);

    expect(summary.map((entry) => entry.restaurantId)).toEqual(["pricey", "cheap", null]);
    expect(summary[0]).toMatchObject({ calls: 30, unpricedCalls: 1 });
    expect(summary[0].costUsd).toBeCloseTo(0.81, 6);
    expect(summary[0].features.map((feature) => feature.label)).toEqual(["Menu photos", "WhatsApp chatbot"]);
  });

  it("copes with numeric strings from the database and unknown features", () => {
    const summary = summarizeAiUsage([
      { ...row("r", "brand_new_feature", 0, 0), calls: "4" as unknown as number, estimated_cost_usd: "0.5" as unknown as number }
    ]);
    expect(summary[0]).toMatchObject({ calls: 4, costUsd: 0.5 });
    expect(summary[0].features[0].label).toBe("brand_new_feature");
  });

  it("has a label for every feature", () => {
    for (const feature of AI_FEATURES) {
      expect(AI_FEATURE_LABELS[feature]).toBeTruthy();
    }
  });

  it("shows small costs with enough precision to be useful", () => {
    expect(formatUsd(0.0042)).toBe("$0.004");
    expect(formatUsd(12.345)).toBe("$12.35");
  });
});
