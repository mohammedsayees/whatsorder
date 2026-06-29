// lib/customer-auth/cookies.ts
//
// Server-only cookie helpers (uses next/headers). Keeps the customer session
// in an httpOnly, Secure, SameSite=Lax cookie so it survives PWA relaunch /
// home-screen install and the customer stays "logged in" for ~90 days.
//
// PER-CAFÉ ISOLATION: the cookie name is scoped to the restaurant id, so being
// signed in at café A creates no session at café B on the same browser. Each
// café has its own cookie and its own identify flow — matching the per-café
// product decision and the (restaurant_id, phone) data model.

import { cookies } from "next/headers";
import {
  mintSessionToken,
  verifySessionToken,
  SESSION_TTL_SECONDS,
  type CustomerIdentity,
} from "./tokens";

function cookieName(restaurantId: string): string {
  // restaurant ids are uuids — safe characters for a cookie name.
  return `wo_cs_${restaurantId}`;
}

/**
 * Issue (or refresh) the session cookie for a café. Call after a successful
 * deep-link verify or OTP verify.
 */
export async function setCustomerSession(identity: CustomerIdentity): Promise<void> {
  const token = await mintSessionToken(identity);
  const jar = await cookies();
  jar.set(cookieName(identity.restaurantId), token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/**
 * Read and verify the session for a specific café. Returns the identity if the
 * caller is signed in at THIS café, otherwise null. Returning null is the
 * normal "cold open" case — the PWA should then run its identify flow.
 */
export async function getCustomerSession(
  restaurantId: string,
): Promise<CustomerIdentity | null> {
  const jar = await cookies();
  const token = jar.get(cookieName(restaurantId))?.value;
  if (!token) return null;
  try {
    const identity = await verifySessionToken(token);
    // Defense in depth: the cookie name and the token claim must agree.
    if (identity.restaurantId !== restaurantId) return null;
    return identity;
  } catch {
    return null; // expired or tampered → treat as not signed in
  }
}

/** Sign the customer out of a single café (e.g. an explicit "not me"). */
export async function clearCustomerSession(restaurantId: string): Promise<void> {
  const jar = await cookies();
  jar.delete(cookieName(restaurantId));
}
