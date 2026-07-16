"use server";

import { revalidatePath } from "next/cache";
import {
  getChatConversation,
  isWithinServiceWindow,
  markChatConversationRead,
  recordOutboundChatMessage,
  setChatConversationStatus
} from "@/lib/chat-inbox";
import { sendWhatsAppText } from "@/lib/customer-auth/whatsapp-cloud";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

const CHAT_ROLES = ["restaurant_admin", "owner", "manager"] as const;
const MAX_MESSAGE_LENGTH = 4096;

export type SendChatMessageState = {
  error?: string;
  sentAt?: number;
};

export async function sendChatMessageAction(
  _prevState: SendChatMessageState,
  formData: FormData
): Promise<SendChatMessageState> {
  const session = await requireRestaurantRole([...CHAT_ROLES]);

  const conversationId = String(formData.get("conversationId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!conversationId) {
    return { error: "Missing conversation." };
  }
  if (!body) {
    return { error: "Type a message first." };
  }
  if (body.length > MAX_MESSAGE_LENGTH) {
    return { error: `Message is too long (max ${MAX_MESSAGE_LENGTH} characters).` };
  }

  const conversation = await getChatConversation(
    session.restaurantId,
    conversationId
  );
  if (!conversation) {
    return { error: "Conversation not found." };
  }

  // Meta rejects free-form sends outside the 24h customer-service window;
  // template messages are phase 2, so block the send with a clear reason.
  if (!isWithinServiceWindow(conversation.last_inbound_at)) {
    return {
      error:
        "The 24-hour reply window has closed. You can reply once the customer messages again."
    };
  }

  const sent = await sendWhatsAppText(conversation.customer_phone, body);
  if (!sent) {
    return {
      error: "WhatsApp send failed. Check the WhatsApp connection and try again."
    };
  }

  await recordOutboundChatMessage({
    restaurantId: session.restaurantId,
    conversationId: conversation.id,
    body,
    sentBy: session.userId
  });
  await markChatConversationRead(session.restaurantId, conversation.id);

  revalidatePath("/admin/chats");
  return { sentAt: Date.now() };
}

export async function setChatStatusAction(formData: FormData): Promise<void> {
  const session = await requireRestaurantRole([...CHAT_ROLES]);

  const conversationId = String(formData.get("conversationId") ?? "");
  const status = formData.get("status");
  if (!conversationId || (status !== "open" && status !== "closed")) {
    return;
  }

  await setChatConversationStatus(session.restaurantId, conversationId, status);
  revalidatePath("/admin/chats");
}
