// lib/customer-auth/session.ts
//
// The one place that answers "who is the signed-in customer at this café?"
// for server code: verifies the per-café session cookie, then checks that
// staff haven't signed this customer out everywhere since it was issued.
// Fails closed — any lookup failure is treated as signed out.

import "server-only";

import { getCustomerSession } from "@/lib/customer-auth/cookies";
import { isSessionRevoked } from "@/lib/customer-auth/one-time";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { SessionClaims } from "@/lib/customer-auth/tokens";

export type CustomerSessionResult =
  | { status: "signed_out" }
  | { status: "unavailable"; identity: SessionClaims }
  | { status: "signed_in"; identity: SessionClaims };

export async function resolveCustomerSession(
  restaurantId: string
): Promise<CustomerSessionResult> {
  const identity = await getCustomerSession(restaurantId);
  if (!identity) {
    return { status: "signed_out" };
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { status: "unavailable", identity };
  }

  const { data: revocation, error } = await supabase
    .from("customer_session_revocations")
    .select("revoked_before")
    .eq("restaurant_id", identity.restaurantId)
    .eq("phone", identity.phone)
    .maybeSingle();
  if (
    error ||
    isSessionRevoked(identity.issuedAt, revocation?.revoked_before as string | undefined)
  ) {
    return { status: "signed_out" };
  }

  return { status: "signed_in", identity };
}
