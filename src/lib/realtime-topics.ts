// Private Realtime Broadcast topics for dashboard live updates.
// Sent by database triggers (supabase/migrations/
// 20261207090000_realtime_broadcast_triggers.sql); joining is authorized by
// the realtime.messages policy (restaurant members and super admins only).
//
// Payloads carry ids and statuses only. Anything else is re-read through the
// existing tenant-scoped server endpoints.

export const restaurantOrdersTopic = (restaurantId: string) =>
  `restaurant:${restaurantId}:orders`;

export const restaurantChatsTopic = (restaurantId: string) =>
  `restaurant:${restaurantId}:chats`;

// Every dashboard channel must be private: a public channel would skip the
// realtime.messages authorization policy entirely.
export const privateChannelConfig = { config: { private: true } } as const;

export type OrderBroadcast = {
  id: string;
  status: string | null;
  fulfilment_type: string | null;
  customer_arrived_at: string | null;
  online_payment_status: string | null;
};

export type ConversationBroadcast = { id: string; unread_count: number };

export type MessageBroadcast = {
  id: string;
  conversation_id: string;
  direction: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const text = (value: unknown) => (typeof value === "string" && value ? value : null);

export function parseOrderBroadcast(value: unknown): OrderBroadcast | null {
  const payload = record(value);
  const id = text(payload?.id);
  if (!payload || !id) {
    return null;
  }

  return {
    id,
    status: text(payload.status),
    fulfilment_type: text(payload.fulfilment_type),
    customer_arrived_at: text(payload.customer_arrived_at),
    online_payment_status: text(payload.online_payment_status)
  };
}

export function parseConversationBroadcast(value: unknown): ConversationBroadcast | null {
  const payload = record(value);
  const id = text(payload?.id);
  const unreadCount = Number(payload?.unread_count);
  if (!id || payload?.unread_count === null || !Number.isFinite(unreadCount)) {
    return null;
  }

  return { id, unread_count: unreadCount };
}

export function parseMessageBroadcast(value: unknown): MessageBroadcast | null {
  const payload = record(value);
  const id = text(payload?.id);
  const conversationId = text(payload?.conversation_id);
  if (!id || !conversationId) {
    return null;
  }

  return { id, conversation_id: conversationId, direction: text(payload?.direction) };
}
