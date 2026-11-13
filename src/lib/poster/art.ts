// lib/poster/art.ts
//
// Poster AI artwork: a studio cut-out of a dish photo, or an illustrated
// background for an item with no photo. Generated at most once per
// (restaurant, menu item, kind) and cached in public.poster_art + the private
// `posters` bucket; every later poster reuses it.
//
// Cost control (this calls a paid image model):
//   * only triggered from POST /api/poster/generate, which is already behind
//     the per-restaurant hourly limit (limits.ts);
//   * a per-restaurant daily cap (POSTER_ART_DAILY_LIMIT), counted on the
//     ai_image_generations log like the menu editor's cap — but on its own
//     purposes, so the two features don't eat each other's allowance;
//   * every call is logged in ai_image_generations (purpose poster_*);
//   * any failure, timeout or rejected result leaves the Phase 4 layouts in
//     place — posters never wait on, or depend on, this.
//
// The model is never given an item name, price or restaurant name.

import "server-only";

import sharp from "sharp";

import {
  generateGeminiImage,
  posterBackgroundPrompt,
  posterBackgroundTheme,
  posterCutoutPrompt,
  type GeminiImageResult
} from "@/lib/ai/google-image";
import { getSupabaseAdmin } from "@/lib/supabase";

import { keyOutBackground } from "./cutout";
import { POSTER_BUCKET } from "./types";

/** AI artwork images per restaurant per UAE day. */
export const POSTER_ART_DAILY_LIMIT = 20;
/** A `preparing` row older than this is assumed dead and may be retried. */
const PREPARING_STALE_MS = 5 * 60 * 1000;
/** A failed item is not retried for this long (no repeated spend on a bad photo). */
const FAILED_RETRY_MS = 6 * 60 * 60 * 1000;

export type PosterArtKind = "cutout" | "background";
export type PosterArtStatus = "ready" | "preparing" | "limit" | "unavailable" | "none";

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type PosterArtTarget = {
  restaurantId: string;
  menuItemId: string;
  kind: PosterArtKind;
  /** The photo a cut-out is made from (null for backgrounds). */
  sourceImageUrl: string | null;
};

type PosterArtRow = {
  id: string;
  status: "preparing" | "ready" | "failed";
  source_image_url: string | null;
  storage_path: string | null;
  updated_at: string;
};

export function posterArtPath(restaurantId: string, menuItemId: string, kind: PosterArtKind): string {
  return `${restaurantId}/art/${menuItemId}-${kind}.png`;
}

function uaeDayStartIso(now = Date.now()): string {
  const day = new Date(now + 4 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00+04:00`).toISOString();
}

/** Whether an existing row may be (re)generated now. */
export function isClaimable(row: PosterArtRow, sourceImageUrl: string | null, now = Date.now()): boolean {
  const age = now - Date.parse(row.updated_at);
  if (row.status === "preparing") return age > PREPARING_STALE_MS;
  if (row.status === "failed") return age > FAILED_RETRY_MS;
  // Ready: only when the owner has since changed the photo.
  return (row.source_image_url ?? null) !== (sourceImageUrl ?? null);
}

/**
 * The cached artwork for a target, as a data URI, if it is ready and still
 * matches the current photo.
 */
export async function loadReadyPosterArt(
  admin: Admin,
  target: PosterArtTarget
): Promise<{ row: PosterArtRow | null; dataUri: string | null }> {
  const { data, error } = await admin
    .from("poster_art")
    .select("id, status, source_image_url, storage_path, updated_at")
    .eq("restaurant_id", target.restaurantId)
    .eq("menu_item_id", target.menuItemId)
    .eq("kind", target.kind)
    .maybeSingle();
  if (error || !data) {
    return { row: null, dataUri: null };
  }
  const row = data as PosterArtRow;
  if (
    row.status !== "ready" ||
    !row.storage_path ||
    (row.source_image_url ?? null) !== (target.sourceImageUrl ?? null) ||
    !row.storage_path.startsWith(`${target.restaurantId}/`)
  ) {
    return { row, dataUri: null };
  }
  const { data: file, error: downloadError } = await admin.storage
    .from(POSTER_BUCKET)
    .download(row.storage_path);
  if (downloadError || !file) {
    return { row, dataUri: null };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  return { row, dataUri: `data:image/png;base64,${bytes.toString("base64")}` };
}

/** Today's poster-artwork generations; null if it can't be read (callers fail closed). */
export async function posterArtUsedToday(admin: Admin, restaurantId: string): Promise<number | null> {
  const { count, error } = await admin
    .from("ai_image_generations")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .in("purpose", ["poster_cutout", "poster_background"])
    .neq("status", "failed")
    .gte("created_at", uaeDayStartIso());
  if (error) {
    console.error("WhatsOrder poster art: usage read failed", error.code);
    return null;
  }
  return count ?? 0;
}

/**
 * Atomically take ownership of generating this artwork. True only for the
 * single caller that should spend the model call.
 */
export async function claimPosterArt(
  admin: Admin,
  target: PosterArtTarget,
  existing: PosterArtRow | null,
  now = Date.now()
): Promise<boolean> {
  const nowIso = new Date(now).toISOString();
  if (!existing) {
    const { error } = await admin.from("poster_art").insert({
      restaurant_id: target.restaurantId,
      menu_item_id: target.menuItemId,
      kind: target.kind,
      status: "preparing",
      source_image_url: target.sourceImageUrl,
      updated_at: nowIso
    });
    // A unique violation means someone else just claimed it.
    return !error;
  }
  if (!isClaimable(existing, target.sourceImageUrl, now)) {
    return false;
  }
  // Compare-and-set on updated_at so two racing callers can't both win.
  const { data, error } = await admin
    .from("poster_art")
    .update({ status: "preparing", source_image_url: target.sourceImageUrl, error: null, updated_at: nowIso })
    .eq("restaurant_id", target.restaurantId)
    .eq("id", existing.id)
    .eq("updated_at", existing.updated_at)
    .select("id");
  return !error && Array.isArray(data) && data.length === 1;
}

export type PosterArtDeps = {
  generate?: (input: Parameters<typeof generateGeminiImage>[0]) => Promise<GeminiImageResult>;
};

/**
 * Generate, process, store and record one piece of artwork. Never throws:
 * every outcome is written to poster_art and ai_image_generations.
 */
export async function generatePosterArt(
  admin: Admin,
  target: PosterArtTarget & {
    userId: string;
    sourcePhoto: Buffer | null;
    categoryName: string;
    productName: string;
  },
  deps: PosterArtDeps = {}
): Promise<"ready" | "failed"> {
  const generate = deps.generate ?? generateGeminiImage;
  const purpose = target.kind === "cutout" ? "poster_cutout" : "poster_background";
  const prompt =
    target.kind === "cutout"
      ? posterCutoutPrompt()
      : posterBackgroundPrompt(posterBackgroundTheme(target.categoryName, target.productName));
  const path = posterArtPath(target.restaurantId, target.menuItemId, target.kind);
  let model = process.env.GEMINI_IMAGE_MODEL ?? process.env.GOOGLE_IMAGE_MODEL ?? "gemini-2.5-flash-image";

  const fail = async (reason: string) => {
    await admin
      .from("poster_art")
      .update({ status: "failed", error: reason.slice(0, 500), updated_at: new Date().toISOString() })
      .eq("restaurant_id", target.restaurantId)
      .eq("menu_item_id", target.menuItemId)
      .eq("kind", target.kind);
    return "failed" as const;
  };
  const log = (status: "generated" | "failed", error?: string) =>
    admin
      .from("ai_image_generations")
      .insert({
        restaurant_id: target.restaurantId,
        menu_item_id: target.menuItemId,
        created_by: target.userId,
        purpose,
        model,
        prompt,
        style_preset: purpose,
        image_url: "",
        storage_public_id: status === "generated" ? path : null,
        status,
        error_message: error?.slice(0, 500) ?? null
      })
      .then(
        () => undefined,
        () => undefined
      );

  if (target.kind === "cutout" && !target.sourcePhoto) {
    return fail("no_source_photo");
  }

  let generated: GeminiImageResult;
  try {
    generated = await generate({
      prompt,
      ...(target.kind === "cutout" && target.sourcePhoto
        ? {
            inputImage: {
              buffer: await sharp(target.sourcePhoto).rotate().resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 88 }).toBuffer(),
              mimeType: "image/jpeg"
            }
          }
        : {})
    });
    model = generated.model;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    await log("failed", reason);
    return fail(reason);
  }
  // The model call happened (and is billed) from here on: always log it.
  let png: Buffer;
  if (target.kind === "cutout") {
    const cutout = await keyOutBackground(generated.imageBuffer);
    if (!cutout.ok) {
      await log("generated", `rejected:${cutout.reason}`);
      return fail(`rejected:${cutout.reason}`);
    }
    png = cutout.png;
  } else {
    try {
      png = await sharp(generated.imageBuffer)
        .resize(1080, 1080, { fit: "cover" })
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch {
      await log("generated", "rejected:not_an_image");
      return fail("rejected:not_an_image");
    }
  }

  const { error: uploadError } = await admin.storage
    .from(POSTER_BUCKET)
    .upload(path, png, { contentType: "image/png", upsert: true });
  if (uploadError) {
    await log("generated", `upload_failed:${uploadError.message}`);
    return fail("upload_failed");
  }
  await log("generated");
  const { error: readyError } = await admin
    .from("poster_art")
    .update({ status: "ready", storage_path: path, error: null, updated_at: new Date().toISOString() })
    .eq("restaurant_id", target.restaurantId)
    .eq("menu_item_id", target.menuItemId)
    .eq("kind", target.kind);
  return readyError ? fail("record_failed") : "ready";
}

export type PosterArtPlan = {
  status: PosterArtStatus;
  kind: PosterArtKind;
  /** Ready artwork to use in this generation. */
  dataUri: string | null;
  /** Set only when this request won the claim: run after the response. */
  start?: () => Promise<void>;
};

/**
 * Called by the generate route for one subject. Uses cached artwork when it
 * is ready; otherwise, within the daily cap, claims the job and returns a
 * `start` to run after the response (this generation uses the Phase 4
 * layouts; the next one picks the artwork up).
 */
export async function planPosterArt(
  admin: Admin,
  input: {
    restaurantId: string;
    userId: string;
    art: { menuItemId: string; imageUrl: string | null; productName: string; categoryName: string; hasPhoto: boolean };
  },
  deps: PosterArtDeps & {
    fetchSource?: (url: string) => Promise<Buffer | null>;
    now?: number;
  } = {}
): Promise<PosterArtPlan> {
  const kind: PosterArtKind = input.art.hasPhoto ? "cutout" : "background";
  const target: PosterArtTarget = {
    restaurantId: input.restaurantId,
    menuItemId: input.art.menuItemId,
    kind,
    sourceImageUrl: input.art.hasPhoto ? input.art.imageUrl : null
  };
  const { row, dataUri } = await loadReadyPosterArt(admin, target);
  if (dataUri) {
    return { status: "ready", kind, dataUri };
  }
  const configured = Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_AI_API_KEY) || Boolean(deps.generate);
  if (!configured) {
    return { status: "none", kind, dataUri: null };
  }
  if (row && !isClaimable(row, target.sourceImageUrl, deps.now)) {
    return { status: row.status === "preparing" ? "preparing" : "unavailable", kind, dataUri: null };
  }
  // Fail closed: if usage can't be read, don't spend.
  const used = await posterArtUsedToday(admin, input.restaurantId);
  if (used === null || used >= POSTER_ART_DAILY_LIMIT) {
    return { status: "limit", kind, dataUri: null };
  }
  if (!(await claimPosterArt(admin, target, row, deps.now))) {
    return { status: "preparing", kind, dataUri: null };
  }
  const fetchSource = deps.fetchSource ?? (async (url: string) => (await import("./subjects")).fetchImageBytes(url));
  return {
    status: "preparing",
    kind,
    dataUri: null,
    start: async () => {
      const sourcePhoto =
        kind === "cutout" && target.sourceImageUrl ? await fetchSource(target.sourceImageUrl) : null;
      await generatePosterArt(
        admin,
        {
          ...target,
          userId: input.userId,
          sourcePhoto,
          categoryName: input.art.categoryName,
          productName: input.art.productName
        },
        deps
      );
    }
  };
}
