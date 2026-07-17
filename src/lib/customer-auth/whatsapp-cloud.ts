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
  return sendWhatsAppMessagePayload(to, {
    type: "text",
    text: { preview_url: true, body }
  });
}

/**
 * Send a pre-approved template message — the only send Meta allows outside the
 * customer-initiated 24h service window. Template sends are billed per
 * message, so callers must gate this behind an explicit user action.
 * Same contract as sendWhatsAppText: wamid on success, null on failure.
 */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode: string
): Promise<string | null> {
  return sendWhatsAppMessagePayload(to, {
    type: "template",
    template: { name: templateName, language: { code: languageCode } }
  });
}

async function sendWhatsAppMessagePayload(
  to: string,
  payload: Record<string, unknown>
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
          ...payload
        })
      }
    );
    if (!res.ok) {
      console.error("WhatsApp send failed", res.status, await res.text());
      return null;
    }
    try {
      const body = (await res.json()) as {
        messages?: Array<{ id?: string }>;
      };
      return body.messages?.[0]?.id || "unknown";
    } catch {
      return "unknown";
    }
  } catch (error) {
    console.error("WhatsApp send error", error);
    return null;
  }
}

/**
 * Upload media bytes to the Cloud API, returning Meta's media id for use in
 * an image/document message. Same inert-until-configured contract as the
 * senders: null when credentials are missing or the upload fails.
 */
export async function uploadWhatsAppMedia(
  bytes: Uint8Array,
  mimeType: string,
  filename = "media"
): Promise<string | null> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    return null;
  }

  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mimeType);
    form.append(
      "file",
      new Blob([bytes as BlobPart], { type: mimeType }),
      filename
    );

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form
      }
    );
    if (!res.ok) {
      console.error("WhatsApp media upload failed", res.status, await res.text());
      return null;
    }
    const body = (await res.json()) as { id?: string };
    return body.id || null;
  } catch (error) {
    console.error("WhatsApp media upload error", error);
    return null;
  }
}

/**
 * Send an image message referencing an uploaded media id. Free-form send —
 * Meta only accepts it inside the customer's open 24h service window, so
 * callers must gate on isWithinServiceWindow. wamid on success, else null.
 */
export async function sendWhatsAppImage(
  to: string,
  mediaId: string,
  caption?: string
): Promise<string | null> {
  return sendWhatsAppMessagePayload(to, {
    type: "image",
    image: { id: mediaId, ...(caption ? { caption } : {}) }
  });
}
