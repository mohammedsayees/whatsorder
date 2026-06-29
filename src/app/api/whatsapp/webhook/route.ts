// app/api/whatsapp/webhook/route.ts
//
// WhatsApp Cloud API inbound webhook for customer-login.
//
//   GET  → Meta's verification handshake (hub.mode/verify_token/challenge).
//   POST → an inbound message opens the customer-initiated 24h service window;
//          we mint a short-lived link token for (restaurant, sender phone) and
//          reply with a zero-tap deep link into the café. Replies in this
//          window are free-form (no per-message cost).
//
// SAFE BEFORE SETUP: with no env configured, GET verification returns 403 and
// POST acknowledges (200) without sending — so deploying this changes nothing
// until you fill in the WhatsApp env vars.
//
// Required env (see .env.example):
//   WHATSAPP_VERIFY_TOKEN     — string you also enter in Meta's webhook config
//   WHATSAPP_APP_SECRET       — app secret, used to verify request signatures
//   WHATSAPP_ACCESS_TOKEN     — Cloud API token used to send the reply
//   WHATSAPP_PHONE_NUMBER_ID  — the sending number's id
//   NEXT_PUBLIC_APP_URL       — base URL used to build the deep link

import { NextRequest, NextResponse } from "next/server";
import { mintLinkToken } from "@/lib/customer-auth/tokens";
import {
  buildCustomerLinkUrl,
  sendWhatsAppText,
  verifyMetaSignature
} from "@/lib/customer-auth/whatsapp-cloud";
import { getDefaultRestaurant } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest): NextResponse {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    // Meta expects the raw challenge echoed back as text/plain.
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

type WhatsAppInbound = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{ from?: string; type?: string }>;
      };
    }>;
  }>;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read the raw body so we can verify the signature over exact bytes.
  const rawBody = await req.text();

  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    const ok = verifyMetaSignature(
      rawBody,
      req.headers.get("x-hub-signature-256"),
      appSecret
    );
    if (!ok) {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }
  // If no app secret is set we're pre-configuration; accept and no-op below.

  let payload: WhatsAppInbound;
  try {
    payload = JSON.parse(rawBody) as WhatsAppInbound;
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Collect distinct sender phones from this batch of inbound text messages.
  const senders = new Set<string>();
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (message.from) {
          senders.add(message.from);
        }
      }
    }
  }

  if (senders.size > 0) {
    // PILOT: a single WhatsApp number maps to the default café. For multi-number
    // tenancy, resolve the restaurant from the inbound metadata.phone_number_id
    // instead (e.g. a restaurants.whatsapp_phone_number_id column).
    const restaurant = await getDefaultRestaurant();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;

    if (restaurant) {
      await Promise.all(
        [...senders].map(async (phone) => {
          const token = await mintLinkToken({ restaurantId: restaurant.id, phone });
          const url = buildCustomerLinkUrl(baseUrl, token, restaurant.slug);
          await sendWhatsAppText(
            phone,
            `View your order & stamps at ${restaurant.name} →\n${url}`
          );
        })
      );
    }
  }

  // Always 200 quickly so Meta doesn't retry the delivery.
  return NextResponse.json({ ok: true }, { status: 200 });
}
