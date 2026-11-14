"use server";

import { planAllows, planUpgradeMessage } from "@/lib/plan-gates";
import { revalidatePath } from "next/cache";

import { recordOutboundChatMessage } from "@/lib/chat-inbox";
import {
  sendWhatsAppImage,
  uploadWhatsAppMedia
} from "@/lib/customer-auth/whatsapp-cloud";
import { isSegmentFilter } from "@/lib/customer-insights";
import {
  CAMPAIGN_CHANNELS,
  getSegmentMembers,
  type CampaignChannel
} from "@/lib/marketing/campaign";
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
import { posterSendAvailability } from "@/lib/marketing/send-availability";

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
  return sendPoster(session, String(formData.get("posterId") ?? ""));
}

/**
 * Campaign send: one poster to the members of one customer segment, through
 * exactly the same pipeline (consent, open window, frequency cap, ledger).
 * Only the free in-window channel exists; paid template broadcasts are a
 * declared seam that is rejected until implemented.
 */
export async function sendCampaignAction(
  _prevState: SendPosterState,
  formData: FormData
): Promise<SendPosterState> {
  const session = await requireRestaurantRole([...MARKETING_ROLES]);
  const channel = String(formData.get("channel") ?? "service_window") as CampaignChannel;
  if (!CAMPAIGN_CHANNELS[channel]?.available) {
    return { error: "That sending option isn't available yet." };
  }
  const segment = String(formData.get("segment") ?? "");
  if (!isSegmentFilter(segment)) {
    return { error: "Pick a customer segment." };
  }
  // Fresh membership at send time; fail closed if it can't be read.
  let members: Set<string>;
  try {
    members = new Set((await getSegmentMembers(session.restaurantId, segment)).members.map((member) => member.phone));
  } catch {
    return { error: "Couldn't load that segment right now, so nothing was sent. Try again shortly." };
  }
  const result = await sendPoster(session, String(formData.get("posterId") ?? ""), (phone) => members.has(phone));
  revalidatePath("/admin/campaigns/new");
  return result;
}

type MarketingSession = Awaited<ReturnType<typeof requireRestaurantRole>>;

async function sendPoster(
  session: MarketingSession,
  posterId: string,
  include?: (phone: string) => boolean
): Promise<SendPosterState> {
  if (!posterId) {
    return { error: "Missing poster." };
  }
  if (!(await planAllows(session.restaurantId, "campaigns"))) {
    return { error: planUpgradeMessage("campaigns") };
  }

  const poster = await getPosterForRestaurant(session.restaurantId, posterId);
  if (!poster) {
    return { error: "Poster not found." };
  }

  const availability = await posterSendAvailability(session.restaurantId);
  if (!availability.ok) {
    return { error: availability.reason };
  }

  const store = createMarketingSendStore(session.restaurantId, posterId);
  if (!store) {
    return { error: "Sending is unavailable right now. Try again shortly." };
  }

  const fullAudience = await getMarketingAudience(session.restaurantId);
  const audience = include
    ? {
        ...fullAudience,
        recipients: fullAudience.recipients.filter((recipient) => include(recipient.phone)),
        frequencyCapped: (fullAudience.cappedPhones ?? []).filter(include).length
      }
    : fullAudience;
  if (audience.readFailed) {
    // Fail closed, and leave any queued rows queued: a transient read error
    // must not mark customers as skipped.
    return {
      error: "Couldn't check who has opted in right now, so nothing was sent. Try again shortly."
    };
  }
  const caption = buildMarketingCaption(
    poster.copy?.caption,
    posterStoreLink(publicAppUrl(), session.restaurant.slug, posterId),
    poster.copy?.language === "ar" ? "ar" : "en"
  );

  const result = await runMarketingSend({
    store,
    recipients: audience.recipients,
    caption,
    ...(include ? { scope: include } : {}),
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
