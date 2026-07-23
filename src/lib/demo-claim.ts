import { createHash, randomBytes } from "node:crypto";

export const demoClaimCookieName = "whatsorder_demo_claim";
export const demoClaimLifetimeSeconds = 7 * 24 * 60 * 60;

export function createDemoClaimToken() {
  return randomBytes(32).toString("base64url");
}

export function hashDemoClaimToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function serializeDemoClaimCookie(restaurantId: string, token: string) {
  return `${restaurantId}.${token}`;
}

export function parseDemoClaimCookie(value: string | undefined) {
  const separator = value?.indexOf(".") ?? -1;
  if (!value || separator < 1) {
    return null;
  }

  const restaurantId = value.slice(0, separator);
  const token = value.slice(separator + 1);
  if (
    !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(restaurantId) ||
    !/^[A-Za-z0-9_-]{40,64}$/.test(token)
  ) {
    return null;
  }

  return { restaurantId, token };
}
