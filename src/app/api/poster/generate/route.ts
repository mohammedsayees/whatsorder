// POST /api/poster/generate — Poster Studio's single generation endpoint.
//
// owner picks template + subject → assemble props (tenant data + AI copy)
// → 3 variants rendered in parallel (satori → resvg) → PNGs stored in the
// private `posters` bucket → rows inserted (service role) → signed preview
// URLs returned. Node runtime on purpose: render-once-and-store.

import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";

import { buildPosterCaption, posterStoreLink } from "@/lib/poster/caption";
import { planPosterArt, type PosterArtStatus } from "@/lib/poster/art";
import { generateCopyVariants } from "@/lib/poster/copy";
import {
  DEFAULT_POSTER_THEME,
  themesForGeneration
} from "@/lib/poster/themes";
import { DEFAULT_PALETTE } from "@/lib/poster/palette";
import { publicAppUrl } from "@/lib/public-app-url";
import { qrCodeDataUrl } from "@/lib/store-share-assets";
import {
  checkPosterGenerationRateLimit,
  posterRateLimitMessage
} from "@/lib/poster/limits";
import { renderPosterPng } from "@/lib/poster/render";
import { discardPosterArtifacts } from "@/lib/poster/store";
import { buildPosterBranding, buildPosterSubjectBundle } from "@/lib/poster/subjects";
import { isFestivalId } from "@/lib/poster/festivals";
import { posterLanguageAllowed } from "@/lib/poster/language";
import {
  isPosterFormat,
  POSTER_BUCKET,
  isPosterTemplateId,
  layoutForVariant,
  type PosterCopy,
  type PosterSubjectRef
} from "@/lib/poster/types";
import { resolveRestaurantAdminSession } from "@/lib/super-admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const SIGNED_URL_TTL_SECONDS = 60 * 60;

// Marketing sits with the management roles (same set as Chats); counter staff
// don't publish on the café's behalf.
const MARKETING_ROLES = new Set(["restaurant_admin", "owner", "manager"]);

type GenerateBody = {
  templateId?: unknown;
  subjectRef?: unknown;
  /** "Swap photo" v1: force the text-only design even when a photo exists. */
  forceTypographic?: unknown;
  /** "default": every variant in the restaurant's theme; "mix": one per theme. */
  themeMode?: unknown;
  /** "story" (9:16, default) | "portrait" (4:5) | "square" (1:1). */
  format?: unknown;
  /** "en" (default) | "ar" — Arabic only for restaurants with Arabic-speaking customers. */
  language?: unknown;
};

type GeneratedVariant = {
  posterId: string;
  previewUrl: string;
  downloadUrl: string;
  copy: PosterCopy;
  /** AI caption + tracked store link, ready to paste (no opt-out line). */
  shareCaption: string;
  variantIndex: number;
  theme: string;
  format: string;
};

function parseSubjectRef(value: unknown): PosterSubjectRef | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.loyalty === true) {
    return { loyalty: true };
  }
  if (isFestivalId(candidate.festival)) {
    return typeof candidate.menu_item_id === "string" && candidate.menu_item_id
      ? { festival: candidate.festival, menu_item_id: candidate.menu_item_id }
      : { festival: candidate.festival };
  }
  if (typeof candidate.menu_item_id === "string" && candidate.menu_item_id) {
    return { menu_item_id: candidate.menu_item_id };
  }
  if (typeof candidate.offer_id === "string" && candidate.offer_id) {
    return { offer_id: candidate.offer_id };
  }
  return null;
}

export async function POST(request: Request) {
  const resolution = await resolveRestaurantAdminSession();
  if (!resolution.session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  if (!MARKETING_ROLES.has(resolution.session.role)) {
    return NextResponse.json(
      { error: "You do not have permission to create posters." },
      { status: 403 }
    );
  }
  const { restaurant, restaurantId } = resolution.session;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Poster Studio is not configured." },
      { status: 503 }
    );
  }

  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const subjectRef = parseSubjectRef(body.subjectRef);
  if (!isPosterTemplateId(body.templateId) || !subjectRef) {
    return NextResponse.json(
      { error: "Unknown template or subject." },
      { status: 400 }
    );
  }
  const templateId = body.templateId;
  const format = isPosterFormat(body.format) ? body.format : "story";
  const language = body.language === "ar" && posterLanguageAllowed(restaurant) ? "ar" : "en";

  const [bundle, branding] = await Promise.all([
    buildPosterSubjectBundle(admin, restaurant, templateId, subjectRef),
    buildPosterBranding(restaurant)
  ]);
  if (!bundle) {
    return NextResponse.json(
      { error: "That item or offer is no longer available." },
      { status: 404 }
    );
  }
  if (body.forceTypographic === true) {
    bundle.subject.photoDataUri = null;
    bundle.subject.photoTallDataUri = null;
  }

  // Cost control: checked (and the attempt recorded) only once the request is
  // known-good, right before the model call and renders that cost money.
  const limit = await checkPosterGenerationRateLimit(
    admin,
    restaurantId,
    resolution.session.userId ?? null
  );
  if (limit.status === "limited") {
    return NextResponse.json(
      {
        error: posterRateLimitMessage(limit.retryAfterSeconds),
        code: "rate_limited",
        retryAfterSeconds: limit.retryAfterSeconds
      },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) }
      }
    );
  }
  if (limit.status === "unavailable") {
    return NextResponse.json(
      { error: "Poster Studio is busy right now. Please try again in a minute." },
      { status: 503 }
    );
  }

  // AI artwork (cut-out / background): use it when cached; otherwise start
  // it in the background for next time. Text-only posters skip it entirely.
  let artStatus: PosterArtStatus = "none";
  const [copyVariants, artPlan] = await Promise.all([
    generateCopyVariants({ templateId, ...bundle.facts, language }),
    body.forceTypographic === true || !bundle.art
      ? Promise.resolve(null)
      : planPosterArt(admin, {
          restaurantId,
          userId: resolution.session.userId,
          art: bundle.art!
        }).catch((error: unknown) => {
          console.error("WhatsOrder poster art plan failed", error);
          return null;
        })
  ]);
  if (artPlan) {
    artStatus = artPlan.status;
    if (artPlan.dataUri) {
      if (artPlan.kind === "cutout") bundle.subject.cutoutDataUri = artPlan.dataUri;
      else bundle.subject.backgroundDataUri = artPlan.dataUri;
    }
    if (artPlan.start) {
      const start = artPlan.start;
      after(() =>
        start().catch((error: unknown) => {
          console.error("WhatsOrder poster art generation failed", error);
        })
      );
    }
  }

  const themes = themesForGeneration(
    branding.theme ?? DEFAULT_POSTER_THEME,
    body.themeMode === "mix" ? "mix" : "default",
    copyVariants.length
  );

  // Everything this request creates, so a partial failure can be undone.
  // Recorded BEFORE each write is attempted: a write that errors client-side
  // may still have landed, and removing a non-existent object is harmless.
  const created = { posterIds: [] as string[], storagePaths: [] as string[] };
  const appUrl = publicAppUrl();

  // allSettled, not all: every variant must have finished (or failed) before
  // cleanup runs, or a slow sibling could upload after the cleanup.
  const settled = await Promise.allSettled(
    copyVariants.map(async (copy: PosterCopy, variantIndex: number) => {
      const posterId = randomUUID();
      const storagePath = `${restaurantId}/${posterId}.png`;
      // Each variant slot gets its own composition, so one generation offers
      // three visually distinct posters — not the same layout thrice.
      const layout = layoutForVariant(variantIndex);
      const theme = themes[variantIndex];
      // Each variant's QR encodes its own tracked link, so orders from a
      // scanned poster are attributed to that exact poster.
      const storeLink = posterStoreLink(appUrl, restaurant.slug, posterId);
      const qrDataUri = await qrCodeDataUrl(storeLink, {
        width: 360,
        margin: 1,
        dark: (branding.palette ?? DEFAULT_PALETTE).dark
      }).catch(() => null);
      const png = await renderPosterPng({
        templateId,
        layout,
        branding: { ...branding, theme },
        format,
        language,
        subject: bundle.subject,
        copy,
        cta: { qrDataUri }
      });

      created.storagePaths.push(storagePath);
      const { error: uploadError } = await admin.storage
        .from(POSTER_BUCKET)
        .upload(storagePath, png, { contentType: "image/png" });
      if (uploadError) {
        throw new Error(`POSTER_UPLOAD_FAILED:${uploadError.message}`);
      }

      created.posterIds.push(posterId);
      const { error: insertError } = await admin.from("posters").insert({
        id: posterId,
        restaurant_id: restaurantId,
        template_id: templateId,
        subject_ref: subjectRef,
        copy: { ...copy, variant_index: variantIndex, layout, theme, format, language },
        storage_path: storagePath,
        status: "rendered"
      });
      if (insertError) {
        throw new Error(`POSTER_INSERT_FAILED:${insertError.message}`);
      }

      const [previewResult, downloadResult] = await Promise.all([
        admin.storage
          .from(POSTER_BUCKET)
          .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS),
        admin.storage
          .from(POSTER_BUCKET)
          .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, {
            download: `${templateId}-poster.png`
          })
      ]);
      if (previewResult.error || !previewResult.data?.signedUrl) {
        throw new Error("POSTER_SIGN_FAILED");
      }

      return {
        posterId,
        previewUrl: previewResult.data.signedUrl,
        downloadUrl:
          downloadResult.data?.signedUrl ?? previewResult.data.signedUrl,
        copy,
        shareCaption: buildPosterCaption(copy.caption, { storeLink }),
        variantIndex,
        theme,
        format
      };
    })
  );

  const failure = settled.find(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failure) {
    console.error("WhatsOrder poster generate failed", failure.reason);
    await discardPosterArtifacts(restaurantId, created);
    return NextResponse.json(
      { error: "Poster generation failed. Please try again." },
      { status: 500 }
    );
  }

  const variants = settled.map(
    (result) => (result as PromiseFulfilledResult<GeneratedVariant>).value
  );
  return NextResponse.json({ variants, art: artStatus });
}
