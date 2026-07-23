import { after, NextRequest, NextResponse } from "next/server";
import {
  getChatConversationByPhone,
  isChatAutomationActive,
  pauseChatAutomation,
  recordBotReply,
  recordInboundChatMessages,
  recordOutboundChatMessage
} from "@/lib/chat-inbox";
import {
  generateWhatsAppAiReply,
  getWhatsAppChatbotSettings
} from "@/lib/whatsapp-ai";
import { sendRestaurantWhatsAppText } from "@/lib/whatsapp-integration";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  CONNECTOR_SIGNATURE_HEADER,
  CONNECTOR_TIMESTAMP_HEADER,
  verifyConnectorPayload
} from "@/lib/whatsapp-web-signing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ConnectorEvent = {
  type?: "qr" | "connected" | "disconnected" | "error" | "message";
  restaurantId?: string;
  sessionId?: string;
  qr?: string;
  phone?: string;
  displayName?: string;
  reason?: string;
  message?: {
    id?: string;
    from?: string;
    profileName?: string;
    type?: "text" | "audio";
    body?: string;
    timestamp?: string;
    audioBase64?: string;
    audioMime?: string;
  };
};

async function runReceptionist(input: {
  restaurantId: string;
  phone: string;
  text: string;
  type: "text" | "audio";
  baseUrl: string;
  audioBase64?: string;
  audioMime?: string;
}) {
  const settings = await getWhatsAppChatbotSettings(input.restaurantId);
  if (
    !settings.enabled ||
    (input.type === "text" && !settings.answer_text) ||
    (input.type === "audio" && !settings.answer_audio)
  ) {
    return;
  }

  const conversation = await getChatConversationByPhone(
    input.restaurantId,
    input.phone
  );
  if (!conversation || !isChatAutomationActive(conversation)) return;

  const result = await generateWhatsAppAiReply({
    restaurantId: input.restaurantId,
    text: input.text,
    baseUrl: input.baseUrl,
    settings,
    ...(input.audioBase64 && input.audioMime
      ? { audio: { base64: input.audioBase64, mimeType: input.audioMime } }
      : {})
  });
  if (!result) return;

  const sent = await sendRestaurantWhatsAppText(
    input.restaurantId,
    input.phone,
    result.reply
  );
  if (!sent) return;

  await recordOutboundChatMessage({
    restaurantId: input.restaurantId,
    conversationId: conversation.id,
    body: result.reply,
    waMessageId: sent
  });
  if (result.handoff) {
    await pauseChatAutomation(
      input.restaurantId,
      conversation.id,
      settings.human_pause_minutes
    );
  } else {
    await recordBotReply(input.restaurantId, conversation.id);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  if (
    !verifyConnectorPayload({
      body: rawBody,
      timestamp: req.headers.get(CONNECTOR_TIMESTAMP_HEADER),
      signature: req.headers.get(CONNECTOR_SIGNATURE_HEADER),
      secret: process.env.WHATSAPP_WEB_CONNECTOR_SECRET,
      target: "POST:/api/whatsapp-web/events"
    })
  ) {
    return new NextResponse("Invalid connector signature", { status: 401 });
  }

  let event: ConnectorEvent;
  try {
    event = JSON.parse(rawBody) as ConnectorEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!event.restaurantId || !event.sessionId || !event.type) {
    return NextResponse.json({ ok: false, error: "Incomplete event" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  }

  const { data: integration } = await admin
    .from("whatsapp_integrations")
    .select("restaurant_id, connector_session_id")
    .eq("restaurant_id", event.restaurantId)
    .eq("connector_session_id", event.sessionId)
    .maybeSingle();
  if (!integration) {
    return new NextResponse("Unknown connector session", { status: 403 });
  }

  const nowIso = new Date().toISOString();
  if (event.type !== "message") {
    const update =
      event.type === "qr"
        ? {
            status: "qr_ready",
            qr_payload: event.qr?.slice(0, 8192) ?? null,
            qr_expires_at: new Date(Date.now() + 60_000).toISOString(),
            last_error: null,
            last_seen_at: nowIso,
            updated_at: nowIso
          }
        : event.type === "connected"
          ? {
              status: "active",
              phone_number: event.phone?.replace(/\D/g, "") || null,
              display_name: event.displayName?.slice(0, 120) || null,
              qr_payload: null,
              qr_expires_at: null,
              connected_at: nowIso,
              last_seen_at: nowIso,
              last_error: null,
              updated_at: nowIso
            }
          : {
              status: event.type === "error" ? "error" : "disconnected",
              qr_payload: null,
              qr_expires_at: null,
              last_error: event.reason?.slice(0, 500) || null,
              last_seen_at: nowIso,
              updated_at: nowIso
            };
    await admin
      .from("whatsapp_integrations")
      .update(update)
      .eq("restaurant_id", event.restaurantId)
      .eq("connector_session_id", event.sessionId);
    return NextResponse.json({ ok: true });
  }

  const message = event.message;
  const phone = message?.from?.replace(/\D/g, "") ?? "";
  const messageId = message?.id ? `web:${message.id}` : "";
  if (!message || !phone || !messageId || !["text", "audio"].includes(message.type ?? "")) {
    return NextResponse.json({ ok: true });
  }

  // Connector retries are at-least-once. Do not send a second AI response.
  const { data: existing } = await admin
    .from("whatsapp_messages")
    .select("id")
    .eq("restaurant_id", event.restaurantId)
    .eq("wa_message_id", messageId)
    .maybeSingle();
  if (existing) return NextResponse.json({ ok: true });

  const type = message.type === "audio" ? "audio" : "text";
  const body = (message.body ?? "").slice(0, 4096);
  await Promise.all([
    recordInboundChatMessages(event.restaurantId, [
      {
        waMessageId: messageId,
        from: phone,
        type,
        body,
        timestamp: message.timestamp,
        profileName: message.profileName?.slice(0, 120)
      }
    ]),
    admin
      .from("whatsapp_integrations")
      .update({ last_seen_at: nowIso, updated_at: nowIso })
      .eq("restaurant_id", event.restaurantId)
      .eq("connector_session_id", event.sessionId)
  ]);

  const audioBase64 = message.audioBase64?.slice(0, 3_500_000);
  const audioMime = message.audioMime?.slice(0, 100);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
  after(() =>
    runReceptionist({
      restaurantId: event.restaurantId as string,
      phone,
      text: body,
      type,
      baseUrl,
      audioBase64,
      audioMime
    })
  );

  return NextResponse.json({ ok: true });
}
