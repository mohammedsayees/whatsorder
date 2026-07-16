// lib/chat-inbox.ts
//
// WhatsApp chat inbox (Phase 1): service-role persistence + reads for
// whatsapp_conversations / whatsapp_messages, plus the pure 24h-window math
// shared by the webhook and the admin send action.
//
// Writes are service-role only (RLS exposes both tables read-only to members);
// every function is best-effort and never throws — the webhook must always ack
// Meta with a 200, and a failed history write must not break the deep-link
// reply that customers rely on.

import { getSupabaseAdmin } from "@/lib/supabase";

export type ChatConversationStatus = "open" | "closed";

export type ChatConversation = {
  id: string;
  restaurant_id: string;
  customer_phone: string;
  customer_name: string | null;
  status: ChatConversationStatus;
  unread_count: number;
  last_inbound_at: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  message_type: string;
  body: string;
  status: string | null;
  sent_by: string | null;
  created_at: string;
};

export type ChatConversationFilter = "open" | "closed" | "unread";

export function isChatConversationFilter(
  value: string | undefined
): value is ChatConversationFilter {
  return value === "open" || value === "closed" || value === "unread";
}

// ── 24h customer-service window ──────────────────────────────────────────────

export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Milliseconds of Meta's 24h service window left; 0 when expired or never opened. */
export function serviceWindowRemainingMs(
  lastInboundAt: string | null,
  now: number = Date.now()
): number {
  if (!lastInboundAt) {
    return 0;
  }
  const openedAt = Date.parse(lastInboundAt);
  if (Number.isNaN(openedAt)) {
    return 0;
  }
  return Math.max(0, openedAt + SERVICE_WINDOW_MS - now);
}

export function isWithinServiceWindow(
  lastInboundAt: string | null,
  now: number = Date.now()
): boolean {
  return serviceWindowRemainingMs(lastInboundAt, now) > 0;
}

// ── Message previews ─────────────────────────────────────────────────────────

const PREVIEW_MAX_LENGTH = 120;

/** Inbox-list preview: trimmed text, or a placeholder for non-text messages. */
export function chatMessagePreview(messageType: string, body: string): string {
  if (messageType === "text") {
    const compact = body.replace(/\s+/g, " ").trim();
    return compact.length > PREVIEW_MAX_LENGTH
      ? `${compact.slice(0, PREVIEW_MAX_LENGTH - 1)}…`
      : compact;
  }
  return `[${messageType}]`;
}

/**
 * Mask the customer-login token in a stored copy of an outbound deep link, so
 * chat history never exposes a usable login link to dashboard staff. The
 * customer still receives the real link; only our stored copy is redacted.
 */
export function maskCustomerLinkToken(body: string): string {
  return body.replace(/([?&]token=)[^&\s]+/g, "$1•••");
}

// ── Outbound delivery status (Meta `statuses` webhook) ──────────────────────

const STATUS_RANK: Record<string, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4
};

/**
 * Meta delivers status events at-least-once and out of order (a `delivered`
 * can arrive after `read`). Only move a message's status forward.
 */
export function shouldUpgradeChatStatus(
  current: string | null,
  next: string
): boolean {
  const nextRank = STATUS_RANK[next];
  if (!nextRank) {
    return false;
  }
  const currentRank = current ? (STATUS_RANK[current] ?? 0) : 0;
  return nextRank > currentRank;
}

// ── Persistence (service role) ───────────────────────────────────────────────

export type InboundChatMessage = {
  /** Meta message id (wamid.…) — dedupes webhook redeliveries. */
  waMessageId?: string;
  /** Sender phone, digits-only (Meta already sends it normalized). */
  from: string;
  /** Meta message type: text, image, audio, location, … */
  type: string;
  /** Text body; empty for non-text types in phase 1. */
  body: string;
  /** Meta timestamp (unix seconds as string). */
  timestamp?: string;
  /** WhatsApp profile name from the contacts payload. */
  profileName?: string;
};

function inboundSentAtIso(timestamp: string | undefined, fallback: Date): string {
  const seconds = Number(timestamp);
  if (Number.isFinite(seconds) && seconds > 0) {
    return new Date(seconds * 1000).toISOString();
  }
  return fallback.toISOString();
}

async function getOrCreateConversation(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  restaurantId: string,
  phone: string,
  profileName?: string
): Promise<{ id: string; unread_count: number } | null> {
  const { data: existing, error: selectError } = await admin
    .from("whatsapp_conversations")
    .select("id, unread_count")
    .eq("restaurant_id", restaurantId)
    .eq("customer_phone", phone)
    .maybeSingle();

  if (selectError) {
    console.error("WhatsOrder chat: conversation lookup failed", selectError.code);
    return null;
  }
  if (existing) {
    return existing;
  }

  // upsert so a concurrent webhook delivery for the same phone can't violate
  // the (restaurant_id, customer_phone) unique constraint.
  const { data: created, error: insertError } = await admin
    .from("whatsapp_conversations")
    .upsert(
      {
        restaurant_id: restaurantId,
        customer_phone: phone,
        customer_name: profileName ?? null
      },
      { onConflict: "restaurant_id,customer_phone" }
    )
    .select("id, unread_count")
    .single();

  if (insertError || !created) {
    console.error(
      "WhatsOrder chat: conversation create failed",
      insertError?.code
    );
    return null;
  }
  return created;
}

/**
 * Persist a batch of inbound webhook messages for one restaurant: upserts the
 * conversation per sender, dedupes on wa_message_id (Meta redelivers on slow
 * acks), reopens closed conversations and bumps the unread count.
 */
export async function recordInboundChatMessages(
  restaurantId: string,
  messages: InboundChatMessage[]
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin || messages.length === 0) {
    return;
  }

  const now = new Date();
  const byPhone = new Map<string, InboundChatMessage[]>();
  for (const message of messages) {
    const batch = byPhone.get(message.from) ?? [];
    batch.push(message);
    byPhone.set(message.from, batch);
  }

  for (const [phone, batch] of byPhone) {
    try {
      const profileName = batch.find((m) => m.profileName)?.profileName;
      const conversation = await getOrCreateConversation(
        admin,
        restaurantId,
        phone,
        profileName
      );
      if (!conversation) {
        continue;
      }

      // Skip messages we already stored (webhook redelivery).
      const waIds = batch
        .map((m) => m.waMessageId)
        .filter((id): id is string => Boolean(id));
      let seen = new Set<string>();
      if (waIds.length > 0) {
        const { data: existingRows } = await admin
          .from("whatsapp_messages")
          .select("wa_message_id")
          .in("wa_message_id", waIds);
        seen = new Set(
          (existingRows ?? []).map((row) => row.wa_message_id as string)
        );
      }

      const fresh = batch.filter(
        (m) => !m.waMessageId || !seen.has(m.waMessageId)
      );
      if (fresh.length === 0) {
        continue;
      }

      const { error: insertError } = await admin.from("whatsapp_messages").insert(
        fresh.map((m) => ({
          conversation_id: conversation.id,
          restaurant_id: restaurantId,
          direction: "inbound" as const,
          wa_message_id: m.waMessageId ?? null,
          message_type: m.type,
          body: m.body,
          created_at: inboundSentAtIso(m.timestamp, now)
        }))
      );
      if (insertError) {
        console.error("WhatsOrder chat: message insert failed", insertError.code);
        continue;
      }

      const last = fresh[fresh.length - 1];
      const lastAt = inboundSentAtIso(last.timestamp, now);
      const { error: updateError } = await admin
        .from("whatsapp_conversations")
        .update({
          status: "open",
          unread_count: conversation.unread_count + fresh.length,
          last_inbound_at: lastAt,
          last_message_at: lastAt,
          last_message_preview: chatMessagePreview(last.type, last.body),
          ...(profileName ? { customer_name: profileName } : {}),
          updated_at: now.toISOString()
        })
        .eq("id", conversation.id);
      if (updateError) {
        console.error(
          "WhatsOrder chat: conversation update failed",
          updateError.code
        );
      }
    } catch (error) {
      console.error("WhatsOrder chat: inbound persist error", error);
    }
  }
}

/**
 * Persist an outbound send (staff reply or the automated deep-link reply).
 * Call only after the Cloud API send succeeded.
 */
export async function recordOutboundChatMessage(input: {
  restaurantId: string;
  /** Recipient phone, digits-only — used when no conversationId is known (webhook auto-reply). */
  phone?: string;
  conversationId?: string;
  body: string;
  sentBy?: string;
  /** Meta's message id from the send response — correlates status webhooks. */
  waMessageId?: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return;
  }

  try {
    let conversationId = input.conversationId ?? null;
    if (!conversationId && input.phone) {
      const conversation = await getOrCreateConversation(
        admin,
        input.restaurantId,
        input.phone
      );
      conversationId = conversation?.id ?? null;
    }
    if (!conversationId) {
      return;
    }

    const nowIso = new Date().toISOString();
    const { error: insertError } = await admin.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      restaurant_id: input.restaurantId,
      direction: "outbound" as const,
      // "unknown" means the send succeeded but Meta's response had no parseable
      // id — never store it, or two such sends would collide on the unique index.
      wa_message_id:
        input.waMessageId && input.waMessageId !== "unknown"
          ? input.waMessageId
          : null,
      message_type: "text",
      body: input.body,
      status: "sent",
      sent_by: input.sentBy ?? null,
      created_at: nowIso
    });
    if (insertError) {
      console.error("WhatsOrder chat: outbound insert failed", insertError.code);
      return;
    }

    const { error: updateError } = await admin
      .from("whatsapp_conversations")
      .update({
        last_message_at: nowIso,
        last_message_preview: chatMessagePreview("text", input.body),
        updated_at: nowIso
      })
      .eq("id", conversationId)
      .eq("restaurant_id", input.restaurantId);
    if (updateError) {
      console.error(
        "WhatsOrder chat: outbound conversation update failed",
        updateError.code
      );
    }
  } catch (error) {
    console.error("WhatsOrder chat: outbound persist error", error);
  }
}

export type ChatStatusEvent = {
  /** Meta message id the status refers to. */
  waMessageId: string;
  /** sent | delivered | read | failed */
  status: string;
};

/**
 * Apply Meta `statuses` webhook events to stored outbound messages. Events for
 * wamids we never stored (order notifications, pre-inbox sends) are ignored.
 * Statuses only move forward — see shouldUpgradeChatStatus.
 */
export async function applyChatMessageStatuses(
  events: ChatStatusEvent[]
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin || events.length === 0) {
    return;
  }

  try {
    // Latest status per wamid within this delivery.
    const latest = new Map<string, string>();
    for (const event of events) {
      const previous = latest.get(event.waMessageId);
      if (!previous || shouldUpgradeChatStatus(previous, event.status)) {
        latest.set(event.waMessageId, event.status);
      }
    }

    const { data: rows, error } = await admin
      .from("whatsapp_messages")
      .select("id, wa_message_id, status")
      .in("wa_message_id", [...latest.keys()]);
    if (error || !rows) {
      if (error) {
        console.error("WhatsOrder chat: status lookup failed", error.code);
      }
      return;
    }

    for (const row of rows) {
      const next = latest.get(row.wa_message_id as string);
      if (!next || !shouldUpgradeChatStatus(row.status as string | null, next)) {
        continue;
      }
      const { error: updateError } = await admin
        .from("whatsapp_messages")
        .update({ status: next })
        .eq("id", row.id);
      if (updateError) {
        console.error("WhatsOrder chat: status update failed", updateError.code);
      }
    }
  } catch (error) {
    console.error("WhatsOrder chat: status apply error", error);
  }
}

// ── Reads (admin pages, behind auth guards) ──────────────────────────────────

export async function getChatConversations(
  restaurantId: string,
  filter?: ChatConversationFilter,
  limit = 50
): Promise<ChatConversation[]> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return [];
  }

  let query = admin
    .from("whatsapp_conversations")
    .select(
      "id, restaurant_id, customer_phone, customer_name, status, unread_count, last_inbound_at, last_message_at, last_message_preview, created_at"
    )
    .eq("restaurant_id", restaurantId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (filter === "unread") {
    query = query.gt("unread_count", 0);
  } else if (filter) {
    query = query.eq("status", filter);
  }

  const { data, error } = await query;
  if (error) {
    console.error("WhatsOrder chat: conversations read failed", error.code);
    return [];
  }
  return (data ?? []) as ChatConversation[];
}

export async function getChatConversation(
  restaurantId: string,
  conversationId: string
): Promise<ChatConversation | null> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from("whatsapp_conversations")
    .select(
      "id, restaurant_id, customer_phone, customer_name, status, unread_count, last_inbound_at, last_message_at, last_message_preview, created_at"
    )
    .eq("restaurant_id", restaurantId)
    .eq("id", conversationId)
    .maybeSingle();

  if (error) {
    console.error("WhatsOrder chat: conversation read failed", error.code);
    return null;
  }
  return (data as ChatConversation | null) ?? null;
}

export async function getChatMessages(
  restaurantId: string,
  conversationId: string,
  limit = 200
): Promise<ChatMessage[]> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return [];
  }

  // Newest N, then chronological for rendering.
  const { data, error } = await admin
    .from("whatsapp_messages")
    .select(
      "id, conversation_id, direction, message_type, body, status, sent_by, created_at"
    )
    .eq("restaurant_id", restaurantId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("WhatsOrder chat: messages read failed", error.code);
    return [];
  }
  return ((data ?? []) as ChatMessage[]).reverse();
}

export async function markChatConversationRead(
  restaurantId: string,
  conversationId: string
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return;
  }
  const { error } = await admin
    .from("whatsapp_conversations")
    .update({ unread_count: 0, updated_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId)
    .eq("id", conversationId);
  if (error) {
    console.error("WhatsOrder chat: mark-read failed", error.code);
  }
}

export async function setChatConversationStatus(
  restaurantId: string,
  conversationId: string,
  status: ChatConversationStatus
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return;
  }
  const { error } = await admin
    .from("whatsapp_conversations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("restaurant_id", restaurantId)
    .eq("id", conversationId);
  if (error) {
    console.error("WhatsOrder chat: status update failed", error.code);
  }
}
