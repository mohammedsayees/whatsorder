import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn(async (_row: unknown): Promise<{ error: { message: string } | null }> => ({ error: null }));
let adminAvailable = true;
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (adminAvailable ? { from: () => ({ insert }) } : null)
}));

const {
  AI_FEATURES,
  MODEL_PRICES_USD_PER_MILLION,
  measureGeminiUsage,
  priceForModel,
  recordGeminiUsage
} = await import("./usage");

beforeEach(() => {
  insert.mockClear();
  insert.mockResolvedValue({ error: null });
  adminAvailable = true;
});

describe("AI cost estimate", () => {
  it("prices text input and output at the model's list price", () => {
    const usage = measureGeminiUsage("gemini-2.5-flash", {
      promptTokenCount: 1_000_000,
      candidatesTokenCount: 100_000
    });
    // 1M in at $0.30 + 0.1M out at $2.50
    expect(usage.estimatedCostUsd).toBeCloseTo(0.3 + 0.25, 6);
    expect(usage).toMatchObject({ inputTokens: 1_000_000, outputTokens: 100_000, thinkingTokens: 0 });
  });

  it("bills thinking tokens at the output rate", () => {
    const usage = measureGeminiUsage("gemini-2.5-flash", {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      thoughtsTokenCount: 1_000_000
    });
    expect(usage.estimatedCostUsd).toBeCloseTo(2.5, 6);
    expect(usage.thinkingTokens).toBe(1_000_000);
  });

  it("prices voice-note audio input separately from text", () => {
    const usage = measureGeminiUsage("gemini-2.5-flash", {
      promptTokenCount: 1_000_000,
      promptTokensDetails: [
        { modality: "TEXT", tokenCount: 500_000 },
        { modality: "AUDIO", tokenCount: 500_000 }
      ]
    });
    // 0.5M text at $0.30 + 0.5M audio at $1.00
    expect(usage.estimatedCostUsd).toBeCloseTo(0.15 + 0.5, 6);
  });

  it("prices a generated image like Google does (~$0.039 for 1,290 tokens)", () => {
    const usage = measureGeminiUsage("gemini-2.5-flash-image", {
      promptTokenCount: 300,
      candidatesTokenCount: 1_290,
      candidatesTokensDetails: [{ modality: "IMAGE", tokenCount: 1_290 }]
    });
    expect(usage.estimatedCostUsd).toBeCloseTo(0.0388, 4);
  });

  it("prices pinned versions like their model family", () => {
    expect(priceForModel("models/gemini-2.5-flash-001")).toBe(MODEL_PRICES_USD_PER_MILLION["gemini-2.5-flash"]);
    expect(priceForModel("gemini-2.5-flash-lite-preview-06-17")).toBe(
      MODEL_PRICES_USD_PER_MILLION["gemini-2.5-flash-lite"]
    );
    expect(priceForModel("gemini-2.5-flash-image-preview")).toBe(
      MODEL_PRICES_USD_PER_MILLION["gemini-2.5-flash-image"]
    );
  });

  it("records unknown models as unknown cost, not zero", () => {
    const usage = measureGeminiUsage("some-future-model", { promptTokenCount: 10, candidatesTokenCount: 5 });
    expect(usage.estimatedCostUsd).toBeNull();
    expect(usage).toMatchObject({ inputTokens: 10, outputTokens: 5 });
  });

  it("ignores missing or nonsense counts", () => {
    expect(measureGeminiUsage("gemini-2.5-flash", undefined)).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0
    });
    expect(
      measureGeminiUsage("gemini-2.5-flash", { promptTokenCount: -5, candidatesTokenCount: Number.NaN })
    ).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });
});

describe("recordGeminiUsage", () => {
  const payload = { usageMetadata: { promptTokenCount: 2_000, candidatesTokenCount: 100 } };

  it("stores one row billed to the restaurant", async () => {
    await recordGeminiUsage("chatbot_reply", "models/gemini-2.5-flash", payload, { restaurantId: "r-1" });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toMatchObject({
      restaurant_id: "r-1",
      feature: "chatbot_reply",
      model: "gemini-2.5-flash",
      input_tokens: 2_000,
      output_tokens: 100,
      thinking_tokens: 0,
      estimated_cost_usd: 0.00085
    });
  });

  it("stores unattributed usage when no restaurant exists yet", async () => {
    await recordGeminiUsage("menu_extract", "gemini-2.5-flash", payload, { restaurantId: null });
    expect(insert.mock.calls[0][0]).toMatchObject({ restaurant_id: null });
  });

  it("skips responses without usage data", async () => {
    await recordGeminiUsage("poster_copy", "gemini-2.5-flash", { candidates: [] }, { restaurantId: "r-1" });
    await recordGeminiUsage("poster_copy", "gemini-2.5-flash", null, { restaurantId: "r-1" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("never throws, so a logging problem can't break the AI feature", async () => {
    insert.mockRejectedValueOnce(new Error("db down"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      recordGeminiUsage("daily_summary", "gemini-2.5-flash", payload, { restaurantId: "r-1" })
    ).resolves.toBeUndefined();
    insert.mockResolvedValueOnce({ error: { message: "violates check" } });
    await expect(
      recordGeminiUsage("daily_summary", "gemini-2.5-flash", payload, { restaurantId: "r-1" })
    ).resolves.toBeUndefined();
    adminAvailable = false;
    await expect(
      recordGeminiUsage("daily_summary", "gemini-2.5-flash", payload, { restaurantId: "r-1" })
    ).resolves.toBeUndefined();
    errors.mockRestore();
  });
});

describe("AI usage coverage", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  }

  it("records usage for every Gemini call, so per-restaurant cost stays complete", () => {
    const root = resolve(process.cwd(), "src");
    const gaps = sourceFiles(root)
      .filter((path) => !path.endsWith(join("lib", "ai", "usage.ts")))
      .map((path) => {
        const text = readFileSync(path, "utf8");
        return {
          path: path.slice(root.length + 1),
          calls: (text.match(/:generateContent/g) ?? []).length,
          records: (text.match(/recordGeminiUsage\(/g) ?? []).length
        };
      })
      .filter(({ calls, records }) => calls > 0 && records < calls);

    expect(gaps).toEqual([]);
  });

  it("matches the features the database accepts", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261209090000_ai_usage_events.sql"),
      "utf8"
    );
    for (const feature of AI_FEATURES) {
      expect(migration).toContain(`'${feature}'`);
    }
  });
});
