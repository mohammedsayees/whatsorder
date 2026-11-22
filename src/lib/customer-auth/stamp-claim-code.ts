// lib/customer-auth/stamp-claim-code.ts
//
// A short signed form of a receipt's stamp claim, small enough to ride in the
// pre-filled WhatsApp sign-in message ("Login #<code>"). When that message
// arrives, the webhook knows the sender's phone from WhatsApp itself, so it
// can add the stamp right there: the claim no longer depends on the sign-in
// link opening in the same browser that scanned the receipt (it often does
// not: WhatsApp's in-app browser has its own storage).
//
// The café is NOT in the code: it is bound into the signature and checked
// against the café whose number received the message.

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { StampClaim } from "@/lib/customer-auth/stamp-claim";

const VERSION = "wo:stamp-code:v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function secret(): string | null {
  const raw = process.env.CUSTOMER_AUTH_SECRET;
  return raw && raw.length >= 32 ? raw : null;
}

function signature(key: string, restaurantId: string, orderId: string, exp: number): string {
  return createHmac("sha256", key)
    .update(`${VERSION}:${restaurantId.toLowerCase()}:${orderId.toLowerCase()}:${exp}`)
    .digest()
    .subarray(0, 16)
    .toString("base64url");
}

/** "<order>.<expiry>.<signature>" (~53 chars), or null without a secret. */
export function mintStampClaimCode(claim: StampClaim, expiresAtSeconds: number): string | null {
  const key = secret();
  if (!key || !UUID.test(claim.orderId) || !Number.isInteger(expiresAtSeconds) || expiresAtSeconds <= 0) {
    return null;
  }
  const order = Buffer.from(claim.orderId.replace(/-/g, ""), "hex").toString("base64url");
  return `${order}.${expiresAtSeconds.toString(36)}.${signature(key, claim.restaurantId, claim.orderId, expiresAtSeconds)}`;
}

/** The order id when the code is genuine, unexpired and for this café. */
export function verifyStampClaimCode(
  code: string | null | undefined,
  restaurantId: string,
  nowMs: number = Date.now()
): string | null {
  const key = secret();
  const parts = code?.split(".");
  if (!key || !parts || parts.length !== 3 || code!.length > 120) {
    return null;
  }
  const [orderPart, expPart, sigPart] = parts;
  const hex = Buffer.from(orderPart, "base64url").toString("hex");
  if (hex.length !== 32) {
    return null;
  }
  const orderId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const exp = Number.parseInt(expPart, 36);
  if (!Number.isFinite(exp) || exp.toString(36) !== expPart || exp * 1000 <= nowMs) {
    return null;
  }
  const expected = Buffer.from(signature(key, restaurantId, orderId, exp));
  const given = Buffer.from(sigPart);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  return orderId;
}
