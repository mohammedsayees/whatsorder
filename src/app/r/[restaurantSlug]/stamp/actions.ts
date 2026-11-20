"use server";

// Claims the stamp of a counter order from its receipt QR. The order comes
// from the signed claim token (this café only); the phone comes ONLY from
// the customer's verified WhatsApp session — never from the browser.

import { revalidatePath } from "next/cache";
import { resolveCustomerSession } from "@/lib/customer-auth/session";
import { verifyStampClaimToken } from "@/lib/customer-auth/stamp-claim";
import { getRestaurantBySlug } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";

export type StampClaimError =
  | "invalid_link"
  | "signed_out"
  | "already_claimed"
  | "expired"
  | "order_cancelled"
  | "loyalty_off"
  | "failed";

export type StampClaimResult =
  | {
      ok: true;
      outcome: "stamped" | "pending" | "no_stamp" | "already";
      stamps: number;
      required: number;
      reward: string | null;
    }
  | { ok: false; error: StampClaimError };

const KNOWN_ERRORS = new Set<StampClaimError>([
  "already_claimed",
  "expired",
  "order_cancelled",
  "loyalty_off"
]);

export async function claimStampAction(restaurantSlug: string, token: string): Promise<StampClaimResult> {
  const restaurant = await getRestaurantBySlug(String(restaurantSlug ?? ""));
  const claim = await verifyStampClaimToken(String(token ?? ""));
  if (!restaurant || !claim || claim.restaurantId !== restaurant.id) {
    return { ok: false, error: "invalid_link" };
  }

  const session = await resolveCustomerSession(restaurant.id);
  if (session.status !== "signed_in") {
    return { ok: false, error: "signed_out" };
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, error: "failed" };
  }

  const { data, error } = await supabase.rpc("claim_order_stamp", {
    p_restaurant_id: restaurant.id,
    p_order_id: claim.orderId,
    p_phone: session.identity.phone
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

  revalidatePath(`/r/${restaurant.slug}/account`);
  return {
    ok: true,
    outcome: outcome.already ? "already" : outcome.stamped ? "stamped" : outcome.pending ? "pending" : "no_stamp",
    stamps: Math.max(0, Number(outcome.stamps ?? 0)),
    required: Math.max(0, Number(outcome.required ?? 0)),
    reward: outcome.reward ?? null
  };
}
