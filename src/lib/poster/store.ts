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

/**
 * Removes posters (rows, then PNGs) created by a generation that failed part
 * way. Scoped to this restaurant; only status `rendered` rows are touched so
 * a poster that was somehow already sent is never removed. Best-effort: a
 * leftover object is invisible to owners and caught by retention.
 */
export async function discardPosterArtifacts(
  restaurantId: string,
  artifacts: { posterIds: string[]; storagePaths: string[] }
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return;
  }
  if (artifacts.posterIds.length > 0) {
    const { error } = await admin
      .from("posters")
      .delete()
      .eq("restaurant_id", restaurantId)
      .eq("status", "rendered")
      .in("id", artifacts.posterIds);
    if (error) {
      console.error("WhatsOrder poster: discard rows failed", error.code);
    }
  }
  // Only ever remove objects under this restaurant's own prefix.
  const paths = artifacts.storagePaths.filter((path) =>
    path.startsWith(`${restaurantId}/`)
  );
  if (paths.length > 0) {
    const { error } = await admin.storage.from(POSTER_BUCKET).remove(paths);
    if (error) {
      console.error("WhatsOrder poster: discard objects failed", error.message);
    }
  }
}

export type PosterUrls = {
  posterId: string;
  previewUrl: string | null;
  downloadUrl: string | null;
};

/** Fresh signed URLs for this restaurant's posters (signed URLs expire after an hour). */
export async function getFreshPosterUrls(
  restaurantId: string,
  posterIds: string[]
): Promise<PosterUrls[]> {
  const admin = getSupabaseAdmin();
  if (!admin || posterIds.length === 0) {
    return [];
  }
  const { data, error } = await admin
    .from("posters")
    .select("id, template_id, storage_path")
    .eq("restaurant_id", restaurantId)
    .in("id", posterIds);
  if (error) {
    console.error("WhatsOrder poster: url refresh read failed", error.code);
    return [];
  }
  return Promise.all(
    ((data ?? []) as Pick<PosterRow, "id" | "template_id" | "storage_path">[]).map(
      async (row) => ({
        posterId: row.id,
        previewUrl: await signPosterUrl(row.storage_path),
        downloadUrl: await signPosterUrl(row.storage_path, {
          download: `${row.template_id}-poster.png`
        })
      })
    )
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
 * Frequency cap: a customer gets at most one marketing send from a restaurant
 * per this window, whichever poster it was.
 */
export const MARKETING_FREQUENCY_CAP_MS = 24 * 60 * 60 * 1000;

export type MarketingAudience = {
  /** Who a send would actually go to right now. */
  recipients: InWindowRecipient[];
  /** In-window, consented customers held back by the frequency cap. */
  frequencyCapped: number;
  /** A read failed: the audience is empty because we fail closed, not because nobody is eligible. */
  readFailed?: true;
};

const EMPTY_AUDIENCE: MarketingAudience = { recipients: [], frequencyCapped: 0 };
const FAILED_AUDIENCE: MarketingAudience = {
  recipients: [],
  frequencyCapped: 0,
  readFailed: true
};

/**
 * The marketing audience: customers of THIS restaurant whose 24h service
 * window is open (the only audience a free-form image send is allowed for),
 * who have a live marketing opt-in, and who have not had a marketing send in
 * the last MARKETING_FREQUENCY_CAP_MS. Every read fails closed — any error
 * yields an empty audience.
 */
export async function getMarketingAudience(
  restaurantId: string,
  now: number = Date.now()
): Promise<MarketingAudience> {
  const admin = getSupabaseAdmin();
  if (!admin || !restaurantId) {
    return FAILED_AUDIENCE;
  }
  const cutoffIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("whatsapp_conversations")
    .select("id, customer_phone, last_inbound_at")
    .eq("restaurant_id", restaurantId)
    .gte("last_inbound_at", cutoffIso)
    .order("last_inbound_at", { ascending: false })
    .limit(MAX_IN_WINDOW_RECIPIENTS);
  if (error) {
    console.error("WhatsOrder poster: recipients read failed", error.code);
    return FAILED_AUDIENCE;
  }
  // The cutoff is re-checked with the shared window math so a stale row
  // can't slip through.
  const inWindow = ((data ?? []) as {
    id: string;
    customer_phone: string;
    last_inbound_at: string | null;
  }[]).filter((row) => isWithinServiceWindow(row.last_inbound_at));
  if (inWindow.length === 0) {
    return EMPTY_AUDIENCE;
  }

  // A poster is marketing: an open chat window is not consent. Keep only
  // customers of THIS restaurant with a live marketing opt-in.
  const { data: customers, error: consentError } = await admin
    .from("customers")
    .select(
      "phone, marketing_opt_in, consent_marketing, marketing_consent_withdrawn_at"
    )
    .eq("restaurant_id", restaurantId)
    .in(
      "phone",
      inWindow.map((row) => row.customer_phone)
    );
  if (consentError) {
    console.error("WhatsOrder poster: consent read failed", consentError.code);
    return FAILED_AUDIENCE;
  }
  const consented = new Set(
    ((customers ?? []) as MarketingConsentRow[])
      .filter(hasMarketingConsent)
      .map((row) => row.phone)
  );
  const consentedInWindow = inWindow.filter((row) =>
    consented.has(row.customer_phone)
  );
  if (consentedInWindow.length === 0) {
    return EMPTY_AUDIENCE;
  }

  // Frequency cap. A row still `sending` (outcome unknown) counts as sent.
  const capCutoffIso = new Date(now - MARKETING_FREQUENCY_CAP_MS).toISOString();
  const { data: recentSends, error: capError } = await admin
    .from("marketing_sends")
    .select("customer_phone")
    .eq("restaurant_id", restaurantId)
    .in(
      "customer_phone",
      consentedInWindow.map((row) => row.customer_phone)
    )
    .or(`sent_at.gte.${capCutoffIso},status.eq.sending`);
  if (capError) {
    console.error("WhatsOrder poster: frequency cap read failed", capError.code);
    return FAILED_AUDIENCE;
  }
  const recentlyMarketed = new Set(
    ((recentSends ?? []) as { customer_phone: string }[]).map(
      (row) => row.customer_phone
    )
  );

  const recipients = consentedInWindow
    .filter((row) => !recentlyMarketed.has(row.customer_phone))
    .map((row) => ({ conversationId: row.id, phone: row.customer_phone }));
  return {
    recipients,
    frequencyCapped: consentedInWindow.length - recipients.length
  };
}

/** Recipients a marketing send would reach right now (see getMarketingAudience). */
export async function getInWindowRecipients(
  restaurantId: string
): Promise<InWindowRecipient[]> {
  return (await getMarketingAudience(restaurantId)).recipients;
}

export type MarketingConsentRow = {
  phone: string;
  marketing_opt_in: boolean | null;
  consent_marketing: boolean | null;
  marketing_consent_withdrawn_at: string | null;
};

export function hasMarketingConsent(row: MarketingConsentRow): boolean {
  return (
    row.marketing_opt_in === true &&
    row.consent_marketing === true &&
    !row.marketing_consent_withdrawn_at
  );
}
