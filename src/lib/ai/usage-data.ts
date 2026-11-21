import "server-only";

import type { AiFeature } from "@/lib/ai/usage";
import { getSupabaseAdmin } from "@/lib/supabase";

// Super-admin read side of ai_usage_events (service role only). Callers must
// already be behind requireSuperAdmin (the super-admin layout).

export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  chatbot_reply: "WhatsApp chatbot",
  order_parse: "Chat order reading",
  daily_summary: "Daily summary",
  poster_copy: "Poster text",
  poster_art: "Poster art",
  menu_image: "Menu photos",
  menu_extract: "Menu import",
  menu_descriptions: "Item descriptions",
  menu_translate: "Arabic translation",
  finance_extract: "Bill scanning"
};

/** UAE dirham is pegged to the US dollar. */
export const AED_PER_USD = 3.6725;

export type AiUsageSummaryRow = {
  restaurant_id: string | null;
  feature: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  estimated_cost_usd: number;
  unpriced_calls: number;
};

export type AiFeatureUsage = {
  feature: string;
  label: string;
  calls: number;
  costUsd: number;
};

export type RestaurantAiUsage = {
  restaurantId: string | null;
  calls: number;
  costUsd: number;
  unpricedCalls: number;
  features: AiFeatureUsage[];
};

const toNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

/** Group per-feature rows into per-restaurant totals, most expensive first. */
export function summarizeAiUsage(rows: AiUsageSummaryRow[]): RestaurantAiUsage[] {
  const byRestaurant = new Map<string, RestaurantAiUsage>();

  for (const row of rows) {
    const key = row.restaurant_id ?? "";
    const entry =
      byRestaurant.get(key) ??
      ({ restaurantId: row.restaurant_id, calls: 0, costUsd: 0, unpricedCalls: 0, features: [] } as RestaurantAiUsage);
    const calls = toNumber(row.calls);
    const costUsd = toNumber(row.estimated_cost_usd);
    entry.calls += calls;
    entry.costUsd += costUsd;
    entry.unpricedCalls += toNumber(row.unpriced_calls);
    entry.features.push({
      feature: row.feature,
      label: AI_FEATURE_LABELS[row.feature as AiFeature] ?? row.feature,
      calls,
      costUsd
    });
    byRestaurant.set(key, entry);
  }

  return [...byRestaurant.values()]
    .map((entry) => ({
      ...entry,
      features: entry.features.sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls)
    }))
    .sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);
}

export async function getAiUsageSummary(options: {
  days: number;
  restaurantId?: string;
  now?: number;
}): Promise<RestaurantAiUsage[]> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return [];
  }
  const since = new Date((options.now ?? Date.now()) - options.days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin.rpc("get_ai_usage_summary", {
    since,
    target_restaurant_id: options.restaurantId ?? null
  });
  if (error) {
    console.error("WhatsOrder AI usage summary failed", error.message);
    return [];
  }
  return summarizeAiUsage((data ?? []) as AiUsageSummaryRow[]);
}

export function formatUsd(amount: number) {
  return `$${amount < 1 ? amount.toFixed(3) : amount.toFixed(2)}`;
}
