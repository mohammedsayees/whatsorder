import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

// Per-restaurant AI usage and estimated cost (table: ai_usage_events,
// migration 20261209090000). Every Gemini call records the token counts Google
// returns in `usageMetadata`; cost is estimated here from list prices.

export const AI_FEATURES = [
  "chatbot_reply",
  "order_parse",
  "daily_summary",
  "poster_copy",
  "poster_art",
  "menu_image",
  "menu_extract",
  "menu_descriptions",
  "menu_translate",
  "finance_extract"
] as const;

export type AiFeature = (typeof AI_FEATURES)[number];

/** Who a call is billed to. restaurantId is null only before a restaurant exists (/try demo). */
export type AiUsageScope = { restaurantId: string | null };

/**
 * Gemini API paid-tier list prices, USD per 1M tokens. Check
 * https://ai.google.dev/gemini-api/docs/pricing when adding a model or when
 * Google changes prices; costs are stored per call, so a change here only
 * affects new rows. Thinking tokens bill at the output rate.
 */
type ModelPrice = {
  input: number;
  audioInput?: number;
  output: number;
  imageOutput?: number;
};

export const MODEL_PRICES_USD_PER_MILLION: Record<string, ModelPrice> = {
  "gemini-2.5-flash": { input: 0.3, audioInput: 1.0, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, audioInput: 0.3, output: 0.4 },
  // Image output is ~1,290 tokens per image, i.e. about $0.039 an image.
  "gemini-2.5-flash-image": { input: 0.3, output: 2.5, imageOutput: 30 },
  "gemini-2.5-pro": { input: 1.25, output: 10 }
};

type ModalityCount = { modality?: string; tokenCount?: number };

/** The subset of Gemini's `usageMetadata` we read. */
export type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  promptTokensDetails?: ModalityCount[];
  candidatesTokensDetails?: ModalityCount[];
};

export type AiUsageMeasurement = {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  estimatedCostUsd: number | null;
};

const count = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;

function modalityTokens(details: ModalityCount[] | undefined, modality: string) {
  return (details ?? [])
    .filter((detail) => detail?.modality === modality)
    .reduce((total, detail) => total + count(detail?.tokenCount), 0);
}

/** "models/gemini-2.5-flash-001" → "gemini-2.5-flash" price entry, if known. */
export function priceForModel(model: string): ModelPrice | null {
  const name = model.replace(/^models\//, "").toLowerCase();
  if (MODEL_PRICES_USD_PER_MILLION[name]) {
    return MODEL_PRICES_USD_PER_MILLION[name];
  }
  // Pinned versions (e.g. "-001", "-preview-05-20") price like their family.
  const family = Object.keys(MODEL_PRICES_USD_PER_MILLION)
    .sort((a, b) => b.length - a.length)
    .find((key) => name.startsWith(`${key}-`));
  return family ? MODEL_PRICES_USD_PER_MILLION[family] : null;
}

export function measureGeminiUsage(
  model: string,
  usage: GeminiUsageMetadata | null | undefined
): AiUsageMeasurement {
  const inputTokens = count(usage?.promptTokenCount);
  const candidateTokens = count(usage?.candidatesTokenCount);
  const thinkingTokens = count(usage?.thoughtsTokenCount);
  const price = priceForModel(model);

  if (!price) {
    return {
      inputTokens,
      outputTokens: candidateTokens,
      thinkingTokens,
      estimatedCostUsd: null
    };
  }

  const audioInput = Math.min(inputTokens, modalityTokens(usage?.promptTokensDetails, "AUDIO"));
  const imageOutput = Math.min(
    candidateTokens,
    modalityTokens(usage?.candidatesTokensDetails, "IMAGE")
  );
  const perToken = (perMillion: number) => perMillion / 1_000_000;

  const cost =
    (inputTokens - audioInput) * perToken(price.input) +
    audioInput * perToken(price.audioInput ?? price.input) +
    (candidateTokens - imageOutput + thinkingTokens) * perToken(price.output) +
    imageOutput * perToken(price.imageOutput ?? price.output);

  return {
    inputTokens,
    outputTokens: candidateTokens,
    thinkingTokens,
    estimatedCostUsd: Math.round(cost * 1_000_000) / 1_000_000
  };
}

/**
 * Record one Gemini call. Best-effort: never throws and never blocks the
 * feature on a logging failure. `payload` is the parsed generateContent JSON.
 */
export async function recordGeminiUsage(
  feature: AiFeature,
  model: string,
  payload: unknown,
  scope: AiUsageScope | undefined
): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    if (!admin) {
      return;
    }
    const usage =
      payload && typeof payload === "object"
        ? ((payload as { usageMetadata?: GeminiUsageMetadata }).usageMetadata ?? null)
        : null;
    if (!usage) {
      return;
    }
    const measured = measureGeminiUsage(model, usage);
    const { error } = await admin.from("ai_usage_events").insert({
      restaurant_id: scope?.restaurantId ?? null,
      feature,
      model: model.replace(/^models\//, "").slice(0, 100),
      input_tokens: measured.inputTokens,
      output_tokens: measured.outputTokens,
      thinking_tokens: measured.thinkingTokens,
      estimated_cost_usd: measured.estimatedCostUsd
    });
    if (error) {
      console.error("WhatsOrder AI usage not recorded", { feature, reason: error.message });
    }
  } catch (error) {
    console.error("WhatsOrder AI usage not recorded", {
      feature,
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}
