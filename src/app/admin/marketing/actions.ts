"use server";

import { revalidatePath } from "next/cache";

import { recordOutboundChatMessage } from "@/lib/chat-inbox";
import {
  sendWhatsAppImage,
  uploadWhatsAppMedia
} from "@/lib/customer-auth/whatsapp-cloud";
import {
  downloadPosterBytes,
  getInWindowRecipients,
  getPosterForRestaurant,
  setPosterStatus
} from "@/lib/poster/store";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

const MARKETING_ROLES = ["restaurant_admin", "owner", "manager"] as const;

export type SendPosterState = {
  error?: string;
  sentCount?: number;
  failedCount?: number;
  sentAt?: number;
};

/**
 * "Share to recent customers": free in-window sends only (v1). Uploads the
 * stored PNG to the Cloud API once, then sends it as an image message to
 * every customer whose 24h service window is open, recording each send in
 * the chat inbox. Broadcast (paid template) is deliberately absent until
 * v1.5's approval UX exists.
 */
export async function sendPosterToRecentCustomersAction(
  _prevState: SendPosterState,
  formData: FormData
): Promise<SendPosterState> {
  const session = await requireRestaurantRole([...MARKETING_ROLES]);

  const posterId = String(formData.get("posterId") ?? "");
  if (!posterId) {
    return { error: "Missing poster." };
  }

  const poster = await getPosterForRestaurant(session.restaurantId, posterId);
  if (!poster) {
    return { error: "Poster not found." };
  }

  const recipients = await getInWindowRecipients(session.restaurantId);
  if (recipients.length === 0) {
    return {
      error:
        "No customers have an open 24-hour chat window right now. Download the poster and post it as your WhatsApp status instead."
    };
  }

  const bytes = await downloadPosterBytes(poster.storage_path);
  if (!bytes) {
    return { error: "Poster file could not be loaded. Try regenerating it." };
  }

  const mediaId = await uploadWhatsAppMedia(bytes, "image/png", "poster.png");
  if (!mediaId) {
    return {
      error: "WhatsApp media upload failed. Check the WhatsApp connection."
    };
  }

  const caption = poster.copy.caption ?? "";
  let sentCount = 0;
  let failedCount = 0;
  for (const recipient of recipients) {
    const wamid = await sendWhatsAppImage(recipient.phone, mediaId, caption);
    if (!wamid) {
      failedCount += 1;
      continue;
    }
    sentCount += 1;
    await recordOutboundChatMessage({
      restaurantId: session.restaurantId,
      conversationId: recipient.conversationId,
      body: caption,
      sentBy: session.userId,
      waMessageId: wamid,
      messageType: "image"
    });
  }

  if (sentCount > 0) {
    await setPosterStatus(session.restaurantId, posterId, "sent_window");
  }

  revalidatePath("/admin/marketing");
  if (sentCount === 0) {
    return {
      error: "Sending failed for every recipient. Check the WhatsApp connection."
    };
  }
  return { sentCount, failedCount, sentAt: Date.now() };
}
