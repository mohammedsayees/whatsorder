// lib/owner-whatsapp-login/hook-signature.ts
//
// Verifies Supabase Auth hook requests, which are signed with the Standard
// Webhooks scheme: HMAC-SHA256 over "<webhook-id>.<webhook-timestamp>.<body>",
// keyed with the base64 secret shown in the Supabase dashboard as
// "v1,whsec_<base64>". The webhook-signature header holds one or more
// space-separated "v1,<base64 signature>" entries.
//
// TODO(verify): confirm the scheme against Supabase's current Auth Hooks docs
// before enabling the hook in production (the docs could not be fetched when
// this was written). Fails closed on anything unexpected.

import { createHmac, timingSafeEqual } from "node:crypto";

export const HOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function secretBytes(secret: string): Buffer | null {
  const trimmed = secret.trim().replace(/^v1,/, "").replace(/^whsec_/, "");
  if (!trimmed) {
    return null;
  }
  try {
    const bytes = Buffer.from(trimmed, "base64");
    return bytes.length >= 16 ? bytes : null;
  } catch {
    return null;
  }
}

export function verifyStandardWebhook(input: {
  body: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  secret: string | undefined;
  nowSeconds?: number;
}): boolean {
  const { body, id, timestamp, signature, secret } = input;
  if (!secret || !id || !timestamp || !signature) {
    return false;
  }
  const key = secretBytes(secret);
  if (!key) {
    return false;
  }
  if (!/^\d{1,12}$/.test(timestamp)) {
    return false;
  }
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > HOOK_TIMESTAMP_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) {
      return false;
    }
    let given: Buffer;
    try {
      given = Buffer.from(value, "base64");
    } catch {
      return false;
    }
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}
