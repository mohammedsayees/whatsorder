// loyalty-progress.ts
// Stamp-card progress line for the WhatsApp order-confirmation message.
// Backed by the deployed Postgres RPC: get_loyalty_progress(p_restaurant_id uuid, p_phone text).
//
// Touchpoint = order confirmation (the customer just messaged you, so this is inside the 24h
// WhatsApp service window → free-form, no per-message cost). Note the stamp for THIS order is
// minted only when the order reaches "Completed", so this line shows the customer's CURRENT card.

import type { SupabaseClient } from "@supabase/supabase-js";

export type LoyaltyProgress =
  | { enabled: false }
  | {
      enabled: true;
      stamps: number;
      required: number;
      remaining: number;
      reward_available: boolean;
      reward_description: string;
    };

export async function getLoyaltyProgress(
  supabase: SupabaseClient,
  restaurantId: string,
  phone: string,
): Promise<LoyaltyProgress> {
  const { data, error } = await supabase.rpc("get_loyalty_progress", {
    p_restaurant_id: restaurantId,
    p_phone: phone,
  });
  // The RPC always returns an object with `enabled` (unknown/disabled restaurant => { enabled:false }).
  if (error || !data) return { enabled: false };
  return data as LoyaltyProgress;
}

/** Pure formatter — returns the line to append, or "" when nothing should show. */
export function formatLoyaltyLine(p: LoyaltyProgress): string {
  if (!p.enabled) return "";
  if (p.reward_available) {
    return `🎉 You've got a free ${p.reward_description}! Just mention it at the counter.`;
  }
  if (p.stamps === 0) {
    return `This starts your stamp card — collect ${p.required} for a free ${p.reward_description} ☕`;
  }
  return `You're at ${p.stamps} of ${p.required} stamps — ${p.remaining} more for a free ${p.reward_description} ☕`;
}

/** Convenience: fetch + format in one call. */
export async function loyaltyLineForOrder(
  supabase: SupabaseClient,
  restaurantId: string,
  phone: string,
): Promise<string> {
  return formatLoyaltyLine(await getLoyaltyProgress(supabase, restaurantId, phone));
}

// ─────────────────────────────────────────────────────────────────────────────
// INTEGRATION — wired into createOrderAction in src/app/actions.ts, where the
// order_whatsapp_message is built before calling create_order_with_customer_v4:
//
//   const loyaltyLine = await loyaltyLineForOrder(supabase, restaurant.id, customerPhone);
//   const whatsappMessage = loyaltyLine ? `${baseMessage}\n\n${loyaltyLine}` : baseMessage;
//   // ...then pass `whatsappMessage` as order_whatsapp_message to the RPC.
//
// The call site uses the service-role admin client (getSupabaseAdmin), which has execute
// on the RPC. The RPC is SECURITY DEFINER, so it reads loyalty config/balance regardless
// of RLS scope; it returns no PII (stamp counts + reward text only).
// OPTIONAL (decision 2): if a restaurant is bilingual, append a second AR line using your
//       existing name_ar conventions.
// ─────────────────────────────────────────────────────────────────────────────
