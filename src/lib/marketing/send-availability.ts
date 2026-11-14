// lib/marketing/send-availability.ts
//
// Whether this restaurant can send posters to customers right now. Poster
// sends go only through the official WhatsApp Cloud API (image + caption,
// free inside the 24h window). A restaurant connected through the WhatsApp
// Web connector, or one where the Cloud API isn't configured, can't send —
// posters are downloaded and shared by hand instead.

import "server-only";

import { restaurantOwnsCloudNumber } from "@/lib/whatsapp-cloud-tenant";

export type PosterSendAvailability = { ok: true } | { ok: false; reason: string };

export const NO_CLOUD_API_REASON =
  "Sending posters to customers needs the official WhatsApp Business (Cloud API) number, which isn't set up for your restaurant. Your WhatsApp Web connection can't send posters — download the poster and post it as your WhatsApp status, or copy the caption and link to share it.";

/** True only when both Cloud API credentials are present in this deployment. */
export function cloudApiConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() && process.env.WHATSAPP_ACCESS_TOKEN?.trim());
}

export async function posterSendAvailability(restaurantId: string): Promise<PosterSendAvailability> {
  if (!cloudApiConfigured() || !(await restaurantOwnsCloudNumber(restaurantId))) {
    return { ok: false, reason: NO_CLOUD_API_REASON };
  }
  return { ok: true };
}
