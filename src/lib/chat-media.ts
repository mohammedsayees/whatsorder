// lib/chat-media.ts
//
// Inbound WhatsApp media handling (Phase 2b). Meta media ids resolve to a
// download URL that expires within minutes, so the webhook schedules
// downloadChatMedia via next/server's after() — the bytes are fetched right
// after Meta gets its 200 ack and stored in the private `whatsapp-media`
// bucket. Everything here is best-effort: a failed download leaves the
// message row without media_path and the thread shows a placeholder.

import { getSupabaseAdmin } from "@/lib/supabase";

const GRAPH_VERSION = "v21.0";
export const CHAT_MEDIA_BUCKET = "whatsapp-media";
// WhatsApp's own per-type caps top out at 16 MB (audio/video); the bucket
// enforces the same limit server-side.
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

export type ChatMediaJob = {
  /** wamid of the stored inbound message row to attach the media to. */
  waMessageId: string;
  /** Meta media id from the webhook payload. */
  mediaId: string;
};

/** Storage object path for a message's media, namespaced per tenant. */
export function chatMediaPath(
  restaurantId: string,
  waMessageId: string
): string {
  // wamid values are base64ish and can contain '=' — keep paths predictable.
  const safeId = waMessageId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${restaurantId}/${safeId}`;
}

/** Prevent a signed URL from crossing the authenticated tenant's namespace. */
export function isChatMediaPathForRestaurant(
  restaurantId: string,
  mediaPath: string
): boolean {
  const prefix = `${restaurantId}/`;
  if (!mediaPath.startsWith(prefix)) {
    return false;
  }

  const objectName = mediaPath.slice(prefix.length);
  return Boolean(objectName) && !objectName.includes("/");
}

/**
 * Download each job's media from the Graph API and store it in the private
 * bucket, then point the message row at the stored copy. Never throws.
 */
export async function downloadChatMedia(
  restaurantId: string,
  jobs: ChatMediaJob[]
): Promise<void> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const admin = getSupabaseAdmin();
  if (!accessToken || !admin || jobs.length === 0) {
    return;
  }

  for (const job of jobs) {
    try {
      // 1) Resolve the media id to a (short-lived) download URL + mime type.
      const metaRes = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${job.mediaId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!metaRes.ok) {
        console.error("WhatsOrder chat media: lookup failed", metaRes.status);
        continue;
      }
      const meta = (await metaRes.json()) as {
        url?: string;
        mime_type?: string;
        file_size?: number;
      };
      if (!meta.url) {
        continue;
      }
      if (meta.file_size && meta.file_size > MAX_MEDIA_BYTES) {
        console.error("WhatsOrder chat media: skipping oversize file", {
          mediaId: job.mediaId,
          size: meta.file_size
        });
        continue;
      }

      // 2) Fetch the bytes (URL requires the same bearer token).
      const fileRes = await fetch(meta.url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!fileRes.ok) {
        console.error("WhatsOrder chat media: download failed", fileRes.status);
        continue;
      }
      const bytes = Buffer.from(await fileRes.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_MEDIA_BYTES) {
        continue;
      }

      // 3) Store privately and attach to the message row.
      await storeChatMediaBytes(
        restaurantId,
        job.waMessageId,
        bytes,
        meta.mime_type ?? "application/octet-stream"
      );
    } catch (error) {
      console.error("WhatsOrder chat media: job error", error);
    }
  }
}

/**
 * Store media bytes already in hand (the WhatsApp Web connector sends voice
 * notes inline) and point the message row at them. Upsert, so connector
 * retries are harmless. Never throws; returns whether it was stored.
 */
export async function storeChatMediaBytes(
  restaurantId: string,
  waMessageId: string,
  bytes: Buffer,
  contentType: string
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin || bytes.byteLength === 0 || bytes.byteLength > MAX_MEDIA_BYTES) {
    return false;
  }
  try {
    const path = chatMediaPath(restaurantId, waMessageId);
    const { error: uploadError } = await admin.storage
      .from(CHAT_MEDIA_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (uploadError) {
      console.error("WhatsOrder chat media: upload failed", uploadError.message);
      return false;
    }
    const { error: updateError } = await admin
      .from("whatsapp_messages")
      .update({ media_path: path, media_mime: contentType })
      .eq("wa_message_id", waMessageId)
      .eq("restaurant_id", restaurantId);
    if (updateError) {
      console.error("WhatsOrder chat media: message update failed", updateError.code);
      return false;
    }
    return true;
  } catch (error) {
    console.error("WhatsOrder chat media: store error", error);
    return false;
  }
}

/**
 * Mint a short-lived signed URL for a stored media object. Admin pages call
 * this server-side after the auth guard; the bucket itself is private.
 */
export async function getChatMediaSignedUrl(
  restaurantId: string,
  mediaPath: string
): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin || !isChatMediaPathForRestaurant(restaurantId, mediaPath)) {
    return null;
  }
  const { data, error } = await admin.storage
    .from(CHAT_MEDIA_BUCKET)
    .createSignedUrl(mediaPath, 60 * 60);
  if (error || !data?.signedUrl) {
    return null;
  }
  return data.signedUrl;
}
