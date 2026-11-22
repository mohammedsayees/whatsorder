// lib/customer-auth/stamp-claim.ts
//
// "Scan to collect your stamp" on counter receipts. The server signs a
// short-lived token naming ONE order at ONE café; the receipt QR carries it.
// The customer opens it, proves their number with the WhatsApp sign-in, and
// the claim attaches that verified number to the order (once) so it earns its
// stamp. HS256 with CUSTOMER_AUTH_SECRET, own audience, so a claim token can
// never be used as a login link or session.

import { SignJWT, errors, jwtVerify, type JWTPayload } from "jose";

const AUD_STAMP_CLAIM = "wo:stamp:claim";
export const STAMP_CLAIM_TTL = "24h";

/** Pending claim kept on the customer's device while they sign in. */
export function pendingStampClaimKey(restaurantSlug: string): string {
  return `whatsorder-stamp-claim-v1-${restaurantSlug}`;
}

function getSecret(): Uint8Array | null {
  const raw = process.env.CUSTOMER_AUTH_SECRET;
  return raw && raw.length >= 32 ? new TextEncoder().encode(raw) : null;
}

interface StampClaimClaims extends JWTPayload {
  rid: string;
  oid: string;
}

export interface StampClaim {
  restaurantId: string;
  orderId: string;
}

/** Null when the secret is not configured (the receipt then has no QR). */
export async function mintStampClaimToken(claim: StampClaim): Promise<string | null> {
  const secret = getSecret();
  if (!secret) {
    return null;
  }
  return new SignJWT({ rid: claim.restaurantId, oid: claim.orderId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(AUD_STAMP_CLAIM)
    .setExpirationTime(STAMP_CLAIM_TTL)
    .sign(secret);
}

/** The claim, or null if the token is missing, tampered with or expired. */
export async function verifyStampClaimToken(token: string | null | undefined): Promise<StampClaim | null> {
  const secret = getSecret();
  if (!secret || !token || token.length > 2048) {
    return null;
  }
  try {
    const { payload } = await jwtVerify<StampClaimClaims>(token, secret, {
      audience: AUD_STAMP_CLAIM,
      algorithms: ["HS256"]
    });
    if (typeof payload.rid !== "string" || typeof payload.oid !== "string") {
      return null;
    }
    return { restaurantId: payload.rid, orderId: payload.oid };
  } catch {
    return null;
  }
}

export function buildStampClaimUrl(baseUrl: string, restaurantSlug: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/r/${restaurantSlug}/stamp?t=${encodeURIComponent(token)}`;
}

export type StampClaimTokenState =
  | { status: "valid"; claim: StampClaim; expiresAt: number }
  | { status: "expired"; restaurantId: string }
  | { status: "invalid" };

/**
 * Like verifyStampClaimToken, but tells an authentic-but-expired receipt
 * (older than 24h) apart from a broken link, so the page can say which.
 * jose checks the signature before the expiry, so "expired" is genuine.
 */
export async function inspectStampClaimToken(token: string | null | undefined): Promise<StampClaimTokenState> {
  const secret = getSecret();
  if (!secret || !token || token.length > 2048) {
    return { status: "invalid" };
  }
  try {
    const { payload } = await jwtVerify<StampClaimClaims>(token, secret, {
      audience: AUD_STAMP_CLAIM,
      algorithms: ["HS256"]
    });
    if (typeof payload.rid !== "string" || typeof payload.oid !== "string" || typeof payload.exp !== "number") {
      return { status: "invalid" };
    }
    return { status: "valid", claim: { restaurantId: payload.rid, orderId: payload.oid }, expiresAt: payload.exp };
  } catch (error) {
    if (error instanceof errors.JWTExpired && typeof error.payload?.rid === "string") {
      return { status: "expired", restaurantId: error.payload.rid };
    }
    return { status: "invalid" };
  }
}
