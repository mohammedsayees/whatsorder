"use server";

import { revalidatePath } from "next/cache";

import { recordOutboundChatMessage } from "@/lib/chat-inbox";
import {
  sendWhatsAppImage,
  uploadWhatsAppMedia
} from "@/lib/customer-auth/whatsapp-cloud";
import { runMarketingSend } from "@/lib/marketing/send-pipeline";
import { createMarketingSendStore } from "@/lib/marketing/send-store";
import { buildMarketingCaption, posterStoreLink } from "@/lib/poster/caption";
import { publicAppUrl } from "@/lib/public-app-url";
import {
  downloadPosterBytes,
  getFreshPosterUrls,
  getMarketingAudience,
  getPosterForRestaurant,
  setPosterStatus,
  type PosterUrls
} from "@/lib/poster/store";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import { restaurantOwnsCloudNumber } from "@/lib/whatsapp-cloud-tenant";

const MARKETING_ROLES = ["restaurant_admin", "owner", "manager"] as const;

export type SendPosterState = {
  error?: string;
  sentCount?: number;
  failedCount?: number;
  /** Already got this poster / a marketing send in the last 24h, or opted out. */
  skippedCount?: number;
  /** Queued but not reached in this run (time budget); send again to finish. */
  pendingCount?: number;
  sentAt?: number;
};

/**
 * "Share to recent customers": free in-window sends only. The audience is
 * consented customers with an open 24h window who are under the frequency
 * cap. Each recipient is written to the marketing_sends ledger before any
 * send, so a retry or double click never sends twice, and recipients not
 * reached within the time budget stay queued and are reported. Broadcast
 * (paid template) is deliberately absent.
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

  if (!(await restaurantOwnsCloudNumber(session.restaurantId))) {
    return {
      error:
        "Sharing posters needs your own WhatsApp Business number, which isn't set up yet. Download the poster and post it as your WhatsApp status instead."
    };
  }

  const store = createMarketingSendStore(session.restaurantId, posterId);
  if (!store) {
    return { error: "Sending is unavailable right now. Try again shortly." };
  }

  const audience = await getMarketingAudience(session.restaurantId);
  if (audience.readFailed) {
    // Fail closed, and leave any queued rows queued: a transient read error
    // must not mark customers as skipped.
    return {
      error: "Couldn't check who has opted in right now, so nothing was sent. Try again shortly."
    };
  }
  const caption = buildMarketingCaption(
    poster.copy?.caption,
    posterStoreLink(publicAppUrl(), session.restaurant.slug, posterId)
  );

  const result = await runMarketingSend({
    store,
    recipients: audience.recipients,
    caption,
    prepareSender: async () => {
      const bytes = await downloadPosterBytes(poster.storage_path);
      if (!bytes) {
        return null;
      }
      const mediaId = await uploadWhatsAppMedia(bytes, "image/png", "poster.png");
      if (!mediaId) {
        return null;
      }
      return async (row) => {
        const wamid = await sendWhatsAppImage(row.customer_phone, mediaId, caption);
        if (wamid) {
          await recordOutboundChatMessage({
            restaurantId: session.restaurantId,
            ...(row.conversation_id
              ? { conversationId: row.conversation_id }
              : { phone: row.customer_phone }),
            body: caption,
            sentBy: session.userId,
            waMessageId: wamid,
            messageType: "image"
          });
        }
        return wamid;
      };
    }
  });

  if (result.sent > 0) {
    await setPosterStatus(session.restaurantId, posterId, "sent_window");
  }
  revalidatePath("/admin/marketing");

  const counts = {
    sentCount: result.sent,
    failedCount: result.failed,
    skippedCount: result.skipped + audience.frequencyCapped,
    pendingCount: result.pending
  };

  if (result.error === "ledger_unavailable") {
    return {
      ...counts,
      error: "Nothing was sent: the send log couldn't be written. Try again shortly."
    };
  }
  if (result.error === "sender_unavailable") {
    return {
      ...counts,
      error:
        "WhatsApp upload failed, so nothing was sent. Check the WhatsApp connection and send again — queued customers will be picked up."
    };
  }
  if (result.sent + result.failed + result.pending === 0) {
    return {
      ...counts,
      error:
        counts.skippedCount > 0
          ? "Everyone eligible already received this poster or another marketing message in the last 24 hours."
          : "No customers who opted in to marketing have an open 24-hour chat window right now. Download the poster and post it as your WhatsApp status instead."
    };
  }
  if (result.sent === 0 && result.pending === 0) {
    return {
      ...counts,
      error: "Sending failed for every recipient. Check the WhatsApp connection."
    };
  }
  return { ...counts, sentAt: Date.now() };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_URL_REFRESH = 30;

/**
 * Fresh signed preview/download URLs for this restaurant's posters. Signed
 * URLs expire after an hour, so Poster Studio calls this when an image fails
 * to load and right before a download.
 */
export async function refreshPosterUrlsAction(
  posterIds: string[]
): Promise<PosterUrls[]> {
  const session = await requireRestaurantRole([...MARKETING_ROLES]);
  const ids = Array.isArray(posterIds)
    ? [...new Set(posterIds.filter((id) => typeof id === "string" && UUID_PATTERN.test(id)))]
        .slice(0, MAX_URL_REFRESH)
    : [];
  return getFreshPosterUrls(session.restaurantId, ids);
}
