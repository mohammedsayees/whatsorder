// lib/customer-auth/tokens.ts
//
// Pure, edge-safe token logic for WhatsOrder customer "login".
// No Node-only APIs, no next/headers — so this module can also be imported
// from middleware or the WhatsApp webhook handler.
//
// Two token kinds, both HS256-signed with CUSTOMER_AUTH_SECRET:
//   - "link"    : short-lived (10 min), carried in the WhatsApp deep link.
//                 Proves Meta-verified phone + which café. Single purpose.
//   - "session" : long-lived (90 days), stored as an httpOnly cookie so the
//                 customer never sees a login screen again.
//
// Identity is always the pair (restaurantId, phone) — matching the per-café
// (restaurant_id, phone) key already enforced on the customers table.

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

// Resolve the secret lazily (per call), NOT at module load. This module sits on
// the customer menu's render path via loadCustomerContext, so a module-level
// throw would 500 the whole menu when the secret is unset. Lazy + thrown-at-use
// means verifySessionToken's callers (which catch) degrade to "not signed in"
// instead, while the mint/link paths still fail loudly as they should.
function getSecret(): Uint8Array {
  const raw = process.env.CUSTOMER_AUTH_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "CUSTOMER_AUTH_SECRET is missing or too short (need >= 32 chars). " +
        "Generate one with: openssl rand -base64 48",
    );
  }
  return new TextEncoder().encode(raw);
}

const ALG = "HS256";
const AUD_LINK = "wo:customer:link";
const AUD_SESSION = "wo:customer:session";

export const LINK_TTL = "10m";
export const SESSION_TTL = "90d";
export const SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

export interface CustomerIdentity {
  /** Café tenant id (restaurants.id). */
  restaurantId: string;
  /** Digits-only phone, normalized to match the DB convention (e.g. 971586721531). */
  phone: string;
}

/**
 * Normalize a phone to the digits-only form stored in customers.phone
 * (the live data uses "971586721531", no '+'). Align this with any existing
 * normalization in your repo so reads/writes hit the same key.
 */
export function normalizePhone(input: string): string {
  const digits = (input || "").replace(/\D/g, "");
  if (digits.length < 7) {
    throw new Error("Phone number looks invalid after normalization.");
  }
  return digits;
}

interface IdentityClaims extends JWTPayload {
  rid: string;
  phone: string;
}

/**
 * Mint the short-lived deep-link token. Call this from the WhatsApp webhook
 * after the Cloud API has handed you the verified sender phone, then append
 * it to the PWA URL, e.g.:
 *   `${base}/api/customer/link?token=${token}&next=/r/${slug}`
 */
export async function mintLinkToken(identity: CustomerIdentity): Promise<string> {
  const phone = normalizePhone(identity.phone);
  return new SignJWT({ rid: identity.restaurantId, phone })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setAudience(AUD_LINK)
    .setExpirationTime(LINK_TTL)
    .sign(getSecret());
}

/** Verify a deep-link token. Throws if expired, wrong audience, or tampered. */
export async function verifyLinkToken(token: string): Promise<CustomerIdentity> {
  const { payload } = await jwtVerify<IdentityClaims>(token, getSecret(), {
    audience: AUD_LINK,
  });
  if (!payload.rid || !payload.phone) throw new Error("Malformed link token.");
  return { restaurantId: payload.rid, phone: payload.phone };
}

/** Mint the long-lived session token that backs the httpOnly cookie. */
export async function mintSessionToken(identity: CustomerIdentity): Promise<string> {
  const phone = normalizePhone(identity.phone);
  return new SignJWT({ rid: identity.restaurantId, phone })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setAudience(AUD_SESSION)
    .setExpirationTime(SESSION_TTL)
    .sign(getSecret());
}

/** Verify a session token. Throws if expired, wrong audience, or tampered. */
export async function verifySessionToken(token: string): Promise<CustomerIdentity> {
  const { payload } = await jwtVerify<IdentityClaims>(token, getSecret(), {
    audience: AUD_SESSION,
  });
  if (!payload.rid || !payload.phone) throw new Error("Malformed session token.");
  return { restaurantId: payload.rid, phone: payload.phone };
}
