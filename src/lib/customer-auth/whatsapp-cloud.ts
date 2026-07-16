// lib/customer-auth/whatsapp-cloud.ts
//
// Thin helpers for the WhatsApp Cloud API side of customer-login: verifying
// Meta's webhook signature, building the deep-link reply, and sending a text
// message back inside the customer-initiated 24h service window (free-form, so
// no per-message cost). Pure functions are unit-tested; the send is a no-op
// until WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID are configured, so the
// route stays inert before setup.

import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH_VERSION = "v21.0";

/**
 * Build the zero-tap deep link sent back in the WhatsApp reply:
 *   {base}/api/customer/link?token=<linkToken>&next=/r/<slug>
 * The /api/customer/link route verifies the token, sets the session cookie,
 * and redirects into the café — without the token ever showing in the address
 * bar.
 */
export function buildCustomerLinkUrl(
  baseUrl: string,
  token: string,
  slug: string
): string {
  const base = baseUrl.replace(/\/$/, "");
  const next = encodeURIComponent(`/r/${slug}`);
  return `${base}/api/customer/link?token=${token}&next=${next}`;
}

/**
 * Verify Meta's `X-Hub-Signature-256` header against the raw request body using
 * the app secret. Returns false on any mismatch or malformed input. When no app
 * secret is configured we return false so the caller can decide (in dev it may
 * choose to skip verification; in prod a missing secret should fail closed).
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined
): boolean {
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) {
    return false;
  }
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — guard first.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Send a plain-text WhatsApp message via the Cloud API. No-op (returns null)
 * until the access token + phone-number id are set, so the webhook can be wired
 * up before credentials exist. Never throws — logs and returns null on error.
 *
 * On success returns Meta's message id (wamid.…) so callers can correlate the
 * send with later `statuses` webhook events (delivered/read ticks); returns
 * "unknown" if the API accepted the send but no id could be parsed. Callers
 * that only care about success can keep treating the result as a boolean.
 */
export async function sendWhatsAppText(
  to: string,
  body: string
): Promise<string | null> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    return null;
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { preview_url: true, body }
        })
      }
    );
    if (!res.ok) {
      console.error("WhatsApp send failed", res.status, await res.text());
      return null;
    }
    try {
      const payload = (await res.json()) as {
        messages?: Array<{ id?: string }>;
      };
      return payload.messages?.[0]?.id || "unknown";
    } catch {
      return "unknown";
    }
  } catch (error) {
    console.error("WhatsApp send error", error);
    return null;
  }
}
