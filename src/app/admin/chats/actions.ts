"use server";

import { revalidatePath } from "next/cache";
import {
  assignChatConversation,
  clearChatHandoff,
  getChatConversation,
  isWithinServiceWindow,
  markChatConversationRead,
  pauseChatAutomation,
  recordOutboundChatMessage,
  resumeChatAutomation,
  setChatConversationStatus
} from "@/lib/chat-inbox";
import {
  sendWhatsAppTemplate
} from "@/lib/customer-auth/whatsapp-cloud";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import { getWhatsAppChatbotSettings } from "@/lib/whatsapp-ai";
import { formatOpeningTime, todayOpeningHours } from "@/lib/opening-hours";
import {
  getWhatsAppIntegration,
  integrationAllowsFreeForm,
  sendRestaurantWhatsAppText
} from "@/lib/whatsapp-integration";

const CHAT_ROLES = ["restaurant_admin", "owner", "manager"] as const;
const MAX_MESSAGE_LENGTH = 4096;
const QUICK_REPLIES = ["menu", "hours", "location"] as const;
type QuickReply = (typeof QUICK_REPLIES)[number];

export type SendChatMessageState = {
  error?: string;
  sentAt?: number;
};

async function sendStaffReply(input: {
  restaurantId: string;
  userId: string;
  conversationId: string;
  body: string;
}): Promise<string | null> {
  const conversation = await getChatConversation(
    input.restaurantId,
    input.conversationId
  );
  if (!conversation) return "Conversation not found.";

  const integration = await getWhatsAppIntegration(input.restaurantId);
  if (
    !integrationAllowsFreeForm(
      integration,
      isWithinServiceWindow(conversation.last_inbound_at)
    )
  ) {
    return "The 24-hour reply window has closed. You can reply once the customer messages again.";
  }

  const sent = await sendRestaurantWhatsAppText(
    input.restaurantId,
    conversation.customer_phone,
    input.body
  );
  if (!sent) {
    return "WhatsApp send failed. Check the WhatsApp connection and try again.";
  }

  await recordOutboundChatMessage({
    restaurantId: input.restaurantId,
    conversationId: conversation.id,
    body: input.body,
    sentBy: input.userId,
    senderType: "staff",
    waMessageId: sent
  });
  await markChatConversationRead(input.restaurantId, conversation.id);
  await clearChatHandoff(input.restaurantId, conversation.id);
  const chatbotSettings = await getWhatsAppChatbotSettings(input.restaurantId);
  await pauseChatAutomation(
    input.restaurantId,
    conversation.id,
    chatbotSettings.human_pause_minutes
  );
  return null;
}

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

  const error = await sendStaffReply({
    restaurantId: session.restaurantId,
    conversationId,
    body,
    userId: session.userId
  });
  if (error) return { error };

  revalidatePath("/admin/chats");
  return { sentAt: Date.now() };
}

export async function sendChatQuickReplyAction(
  _prevState: SendChatMessageState,
  formData: FormData
): Promise<SendChatMessageState> {
  const session = await requireRestaurantRole([...CHAT_ROLES]);
  const conversationId = String(formData.get("conversationId") ?? "");
  const kind = String(formData.get("quickReply") ?? "") as QuickReply;
  if (!conversationId || !QUICK_REPLIES.includes(kind)) {
    return { error: "Select a valid quick reply." };
  }

  const restaurant = session.restaurant;
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://whatsorder.app"
  ).replace(/\/$/, "");
  let body: string;
  if (kind === "menu") {
    body = `Here is our live menu with current prices and availability: ${appUrl}/r/${encodeURIComponent(restaurant.slug)}`;
  } else if (kind === "location") {
    const address = [restaurant.address, restaurant.city].filter(Boolean).join(", ");
    const mapUrl =
      restaurant.latitude != null && restaurant.longitude != null
        ? `https://www.google.com/maps?q=${restaurant.latitude},${restaurant.longitude}`
        : null;
    body = address
      ? `Our location: ${address}${mapUrl ? `\n${mapUrl}` : ""}`
      : "Please share your area and our team will help you with the location.";
  } else {
    if (!restaurant.opening_hours_enabled) {
      body = "We are currently accepting orders. Please check our live menu for availability.";
    } else {
      const hours = todayOpeningHours(
        restaurant.opening_hours,
        new Date(),
        restaurant.time_zone
      );
      body = hours.closed
        ? "We are closed today."
        : `Today's opening hours are ${formatOpeningTime(hours.open)}–${formatOpeningTime(hours.close)}.`;
    }
  }

  const error = await sendStaffReply({
    restaurantId: session.restaurantId,
    conversationId,
    body,
    userId: session.userId
  });
  if (error) return { error };
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
    senderType: "staff",
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

export async function setChatAutomationAction(formData: FormData): Promise<void> {
  const session = await requireRestaurantRole([...CHAT_ROLES]);
  const conversationId = String(formData.get("conversationId") ?? "");
  const mode = String(formData.get("mode") ?? "");
  if (!conversationId || !["pause", "resume"].includes(mode)) return;
  const conversation = await getChatConversation(
    session.restaurantId,
    conversationId
  );
  if (!conversation) return;
  if (mode === "resume") {
    await resumeChatAutomation(session.restaurantId, conversationId);
  } else {
    await pauseChatAutomation(session.restaurantId, conversationId, null);
  }
  revalidatePath("/admin/chats");
}

export async function assignChatConversationAction(
  formData: FormData
): Promise<void> {
  const session = await requireRestaurantRole([...CHAT_ROLES]);
  const conversationId = String(formData.get("conversationId") ?? "");
  const requestedUserId = String(formData.get("assignedTo") ?? "");
  if (!conversationId) return;
  const assignedTo =
    requestedUserId === "me"
      ? session.userId
      : requestedUserId === "unassigned"
        ? null
        : requestedUserId;
  await assignChatConversation(
    session.restaurantId,
    conversationId,
    assignedTo
  );
  revalidatePath("/admin/chats");
}

export async function markChatReadAction(conversationId: string): Promise<void> {
  if (!conversationId) {
    return;
  }

  const session = await requireRestaurantRole([...CHAT_ROLES]);
  await markChatConversationRead(session.restaurantId, conversationId);
}
