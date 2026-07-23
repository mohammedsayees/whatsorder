"use server";

import { revalidatePath } from "next/cache";
import {
  getChatConversation,
  isWithinServiceWindow,
  markChatConversationRead,
  pauseChatAutomation,
  recordOutboundChatMessage,
  setChatConversationStatus
} from "@/lib/chat-inbox";
import {
  sendWhatsAppTemplate
} from "@/lib/customer-auth/whatsapp-cloud";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import { getWhatsAppChatbotSettings } from "@/lib/whatsapp-ai";
import {
  getWhatsAppIntegration,
  integrationAllowsFreeForm,
  sendRestaurantWhatsAppText
} from "@/lib/whatsapp-integration";

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
  const integration = await getWhatsAppIntegration(session.restaurantId);
  if (
    !integrationAllowsFreeForm(
      integration,
      isWithinServiceWindow(conversation.last_inbound_at)
    )
  ) {
    return {
      error:
        "The 24-hour reply window has closed. You can reply once the customer messages again."
    };
  }

  const sent = await sendRestaurantWhatsAppText(
    session.restaurantId,
    conversation.customer_phone,
    body
  );
  if (!sent) {
    return {
      error: "WhatsApp send failed. Check the WhatsApp connection and try again."
    };
  }

  await recordOutboundChatMessage({
    restaurantId: session.restaurantId,
    conversationId: conversation.id,
    body,
    sentBy: session.userId,
    waMessageId: sent
  });
  await markChatConversationRead(session.restaurantId, conversation.id);
  const chatbotSettings = await getWhatsAppChatbotSettings(session.restaurantId);
  await pauseChatAutomation(
    session.restaurantId,
    conversation.id,
    chatbotSettings.human_pause_minutes
  );

  revalidatePath("/admin/chats");
  return { sentAt: Date.now() };
}

/**
 * Send the configured re-engagement template — the only send Meta permits once
 * the 24h window has closed. Deliberately restricted to closed-window
 * conversations so nobody pays template rates when a free-form reply works.
 */
export async function sendChatTemplateAction(
  _prevState: SendChatMessageState,
  formData: FormData
): Promise<SendChatMessageState> {
  const session = await requireRestaurantRole([...CHAT_ROLES]);

  const conversationId = String(formData.get("conversationId") ?? "");
  if (!conversationId) {
    return { error: "Missing conversation." };
  }

  const conversation = await getChatConversation(
    session.restaurantId,
    conversationId
  );
  if (!conversation) {
    return { error: "Conversation not found." };
  }

  if (isWithinServiceWindow(conversation.last_inbound_at)) {
    return {
      error: "The reply window is still open — send a normal (free) reply instead."
    };
  }

  const templateName =
    process.env.WHATSAPP_REOPEN_TEMPLATE_NAME ?? "hello_world";
  const templateLang = process.env.WHATSAPP_REOPEN_TEMPLATE_LANG ?? "en_US";

  const sent = await sendWhatsAppTemplate(
    conversation.customer_phone,
    templateName,
    templateLang
  );
  if (!sent) {
    return {
      error:
        "Template send failed. Check that the template is approved in the WhatsApp Business account."
    };
  }

  await recordOutboundChatMessage({
    restaurantId: session.restaurantId,
    conversationId: conversation.id,
    body: `Template message sent: ${templateName}`,
    sentBy: session.userId,
    waMessageId: sent
  });

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

export async function markChatReadAction(conversationId: string): Promise<void> {
  if (!conversationId) {
    return;
  }

  const session = await requireRestaurantRole([...CHAT_ROLES]);
  await markChatConversationRead(session.restaurantId, conversationId);
}
