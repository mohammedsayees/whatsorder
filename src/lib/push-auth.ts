import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

const AUDIENCE = "wo:push:order";
const TTL = "7d";
const TTL_SECONDS = 7 * 24 * 60 * 60;

type OrderPushClaims = JWTPayload & {
  oid: string;
  rid: string;
};

export type OrderPushAuthorization = {
  orderId: string;
  restaurantId: string;
};

function getSecret(): Uint8Array | null {
  const raw = process.env.PUSH_AUTH_SECRET ?? process.env.CUSTOMER_AUTH_SECRET;

  if (!raw || raw.length < 32) {
    return null;
  }

  return new TextEncoder().encode(raw);
}

function cookieName(orderId: string): string {
  return `wo_push_${orderId}`;
}

export function isPushAuthorizationConfigured(): boolean {
  return getSecret() !== null;
}

export async function setOrderPushAuthorization(
  authorization: OrderPushAuthorization
): Promise<boolean> {
  const secret = getSecret();

  if (!secret) {
    return false;
  }

  const token = await new SignJWT({
    oid: authorization.orderId,
    rid: authorization.restaurantId
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(AUDIENCE)
    .setExpirationTime(TTL)
    .sign(secret);
  const jar = await cookies();
  jar.set(cookieName(authorization.orderId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS
  });

  return true;
}

export async function getOrderPushAuthorization(
  orderId: string
): Promise<OrderPushAuthorization | null> {
  const secret = getSecret();

  if (!secret) {
    return null;
  }

  const jar = await cookies();
  const token = jar.get(cookieName(orderId))?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify<OrderPushClaims>(token, secret, {
      audience: AUDIENCE
    });

    if (payload.oid !== orderId || !payload.rid) {
      return null;
    }

    return {
      orderId: payload.oid,
      restaurantId: payload.rid
    };
  } catch {
    return null;
  }
}

export function getConfiguredWebPushPublicKey(): string | null {
  if (!isPushAuthorizationConfigured() || !process.env.WEB_PUSH_PRIVATE_KEY) {
    return null;
  }

  return (
    process.env.WEB_PUSH_PUBLIC_KEY ??
    process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ??
    null
  );
}
