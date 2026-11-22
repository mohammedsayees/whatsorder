// lib/customer-auth/stamp-claim-server.ts
//
// Attaches a verified phone to a receipt's order so it earns its stamp. The
// phone must come from a verified source only: the customer's WhatsApp
// session (stamp page) or the sender WhatsApp delivered a message from
// (sign-in webhooks). Never from the browser.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import type { StampClaimError, StampClaimResult } from "@/lib/stamp-claim-text";

const KNOWN_ERRORS = new Set<StampClaimError>([
  "already_claimed",
  "expired",
  "order_cancelled",
  "loyalty_off"
]);

export async function claimOrderStampForPhone(input: {
  restaurantId: string;
  orderId: string;
  phone: string;
}): Promise<StampClaimResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "failed" };
  }

  const { data, error } = await supabase.rpc("claim_order_stamp", {
    p_restaurant_id: input.restaurantId,
    p_order_id: input.orderId,
    p_phone: input.phone
  });
  if (error) {
    console.error("WhatsOrder receipt stamp claim failed", error.code);
    return { ok: false, error: "failed" };
  }

  const outcome = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    already?: boolean;
    stamped?: boolean;
    pending?: boolean;
    stamps?: number;
    required?: number;
    reward?: string | null;
  };
  if (outcome.ok !== true) {
    const reason = String(outcome.reason ?? "");
    return {
      ok: false,
      error: KNOWN_ERRORS.has(reason as StampClaimError)
        ? (reason as StampClaimError)
        : reason === "order_not_found"
          ? "invalid_link"
          : "failed"
    };
  }

  return {
    ok: true,
    outcome: outcome.already ? "already" : outcome.stamped ? "stamped" : outcome.pending ? "pending" : "no_stamp",
    stamps: Math.max(0, Number(outcome.stamps ?? 0)),
    required: Math.max(0, Number(outcome.required ?? 0)),
    reward: outcome.reward ?? null
  };
}
