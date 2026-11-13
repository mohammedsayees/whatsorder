// lib/customer-auth/one-time.ts
//
// Server-side state for customer login (service role):
//   - a deep-link token works once: its jti is recorded on first use, so a
//     forwarded WhatsApp message can't be used to sign in as the customer;
//   - staff can sign a customer out everywhere: sessions issued before
//     customer_session_revocations.revoked_before are ignored.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Record a link token's first use. Returns false if it was already used, or
 * if the use cannot be recorded (fail closed: the customer falls back to the
 * normal identify flow). Tokens minted before jti existed have none and
 * expire within 10 minutes; they are accepted.
 */
export async function consumeLinkToken(
  jti: string | null,
  restaurantId: string
): Promise<boolean> {
  if (!jti) {
    return true;
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return false;
  }
  const { error } = await admin
    .from("customer_link_token_uses")
    .insert({ jti, restaurant_id: restaurantId });
  if (error) {
    if (error.code !== "23505") {
      console.error("WhatsOrder link token use could not be recorded", error.code);
    }
    return false;
  }
  // Housekeeping: uses only matter for the token's 10-minute life.
  await admin
    .from("customer_link_token_uses")
    .delete()
    .lt("used_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  return true;
}

/** True if this session was issued before the customer was signed out everywhere. */
export function isSessionRevoked(
  issuedAtSeconds: number | null,
  revokedBefore: string | null | undefined
): boolean {
  if (!revokedBefore) {
    return false;
  }
  if (issuedAtSeconds === null) {
    return true;
  }
  return issuedAtSeconds * 1000 <= Date.parse(revokedBefore);
}
