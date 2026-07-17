// lib/poster/store.ts
//
// Service-role reads/updates for rendered posters and the in-window send
// audience. Everything is tenant-scoped by restaurant_id; the browser only
// ever sees short-lived signed URLs minted here after the auth guard.

import "server-only";

import { isWithinServiceWindow } from "@/lib/chat-inbox";
import { getSupabaseAdmin } from "@/lib/supabase";

import { POSTER_BUCKET, type PosterRow } from "./types";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export type PosterHistoryEntry = PosterRow & {
  previewUrl: string | null;
  downloadUrl: string | null;
};

export async function signPosterUrl(
  storagePath: string,
  options: { download?: string } = {}
): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return null;
  }
  const { data, error } = await admin.storage
    .from(POSTER_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, {
      ...(options.download ? { download: options.download } : {})
    });
  if (error || !data?.signedUrl) {
    return null;
  }
  return data.signedUrl;
}

export async function getPosterForRestaurant(
  restaurantId: string,
  posterId: string
): Promise<PosterRow | null> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return null;
  }
  const { data, error } = await admin
    .from("posters")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("id", posterId)
    .maybeSingle();
  if (error) {
    console.error("WhatsOrder poster: read failed", error.code);
    return null;
  }
  return (data as PosterRow | null) ?? null;
}

export async function getPosterHistory(
  restaurantId: string,
  limit = 24
): Promise<PosterHistoryEntry[]> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return [];
  }
  const { data, error } = await admin
    .from("posters")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("WhatsOrder poster: history read failed", error.code);
    return [];
  }

  return Promise.all(
    ((data ?? []) as PosterRow[]).map(async (row) => ({
      ...row,
      previewUrl: await signPosterUrl(row.storage_path),
      downloadUrl: await signPosterUrl(row.storage_path, {
        download: `${row.template_id}-poster.png`
      })
    }))
  );
}

export async function downloadPosterBytes(
  storagePath: string
): Promise<Uint8Array | null> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return null;
  }
  const { data, error } = await admin.storage
    .from(POSTER_BUCKET)
    .download(storagePath);
  if (error || !data) {
    console.error("WhatsOrder poster: download failed", error?.message);
    return null;
  }
  return new Uint8Array(await data.arrayBuffer());
}

export async function setPosterStatus(
  restaurantId: string,
  posterId: string,
  status: PosterRow["status"]
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return;
  }
  const { error } = await admin
    .from("posters")
    .update({ status })
    .eq("restaurant_id", restaurantId)
    .eq("id", posterId);
  if (error) {
    console.error("WhatsOrder poster: status update failed", error.code);
  }
}

export type InWindowRecipient = {
  conversationId: string;
  phone: string;
};

// Defensive ceiling; a café's genuinely-open 24h windows are naturally few.
const MAX_IN_WINDOW_RECIPIENTS = 100;

/**
 * Customers whose 24h service window is currently open — the only audience a
 * free-form image send is allowed (and free) for. The cutoff is re-checked
 * with the shared window math so a stale row can't slip through.
 */
export async function getInWindowRecipients(
  restaurantId: string
): Promise<InWindowRecipient[]> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return [];
  }
  const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("whatsapp_conversations")
    .select("id, customer_phone, last_inbound_at")
    .eq("restaurant_id", restaurantId)
    .gte("last_inbound_at", cutoffIso)
    .order("last_inbound_at", { ascending: false })
    .limit(MAX_IN_WINDOW_RECIPIENTS);
  if (error) {
    console.error("WhatsOrder poster: recipients read failed", error.code);
    return [];
  }
  return ((data ?? []) as {
    id: string;
    customer_phone: string;
    last_inbound_at: string | null;
  }[])
    .filter((row) => isWithinServiceWindow(row.last_inbound_at))
    .map((row) => ({ conversationId: row.id, phone: row.customer_phone }));
}
