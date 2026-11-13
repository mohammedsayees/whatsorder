// Caps on orders still waiting for staff ("New"). Orders need no phone
// verification, so these bound what a script can pile onto a restaurant's
// queue with made-up or strangers' numbers. IP rate limits alone are weak:
// rotating IPs are unlimited, while a shared mobile IP blocks real customers.
//
// A resubmission of an order that already exists (same submission token) is
// never blocked: the RPC returns the existing order idempotently.

import "server-only";

import type { getSupabaseAdmin } from "@/lib/supabase";

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

/** Unaccepted orders one phone may have open at one restaurant. */
export const MAX_PENDING_ORDERS_PER_PHONE = 3;
/** Unaccepted orders a restaurant's queue may hold from the public checkout. */
export const MAX_PENDING_ORDERS_PER_RESTAURANT = 40;

export type PendingOrderCapResult = "allowed" | "phone_limit" | "restaurant_limit" | "unavailable";

export function pendingOrderCapDecision(input: {
  alreadySubmitted: boolean;
  pendingForPhone: number;
  pendingForRestaurant: number;
}): Exclude<PendingOrderCapResult, "unavailable"> {
  if (input.alreadySubmitted) return "allowed";
  if (input.pendingForPhone >= MAX_PENDING_ORDERS_PER_PHONE) return "phone_limit";
  if (input.pendingForRestaurant >= MAX_PENDING_ORDERS_PER_RESTAURANT) return "restaurant_limit";
  return "allowed";
}

export async function checkPendingOrderCaps(
  admin: Admin,
  input: { restaurantId: string; customerPhone: string; submissionToken: string }
): Promise<PendingOrderCapResult> {
  const [existing, forPhone, forRestaurant] = await Promise.all([
    admin
      .from("order_submission_keys")
      .select("id")
      .eq("restaurant_id", input.restaurantId)
      .eq("submission_token", input.submissionToken)
      .maybeSingle(),
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", input.restaurantId)
      .eq("status", "New")
      .eq("customer_phone", input.customerPhone),
    admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", input.restaurantId)
      .eq("status", "New")
  ]);

  if (existing.error || forPhone.error || forRestaurant.error) {
    console.error("WhatsOrder pending-order cap check failed", {
      restaurantId: input.restaurantId
    });
    return "unavailable";
  }

  return pendingOrderCapDecision({
    alreadySubmitted: Boolean(existing.data),
    pendingForPhone: forPhone.count ?? 0,
    pendingForRestaurant: forRestaurant.count ?? 0
  });
}
