// POST /api/poster/generate — Poster Studio's single generation endpoint.
//
// owner picks template + subject → assemble props (tenant data + AI copy)
// → 3 variants rendered in parallel (satori → resvg) → PNGs stored in the
// private `posters` bucket → rows inserted (service role) → signed preview
// URLs returned. Node runtime on purpose: render-once-and-store.

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { generateCopyVariants } from "@/lib/poster/copy";
import { renderPosterPng } from "@/lib/poster/render";
import { buildPosterBranding, buildPosterSubjectBundle } from "@/lib/poster/subjects";
import {
  POSTER_BUCKET,
  isPosterTemplateId,
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
};

function parseSubjectRef(value: unknown): PosterSubjectRef | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
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
  }

  const copyVariants = await generateCopyVariants({
    templateId,
    ...bundle.facts
  });

  const variants = await Promise.all(
    copyVariants.map(async (copy: PosterCopy, variantIndex: number) => {
      const posterId = randomUUID();
      const storagePath = `${restaurantId}/${posterId}.png`;
      const png = await renderPosterPng({
        templateId,
        branding,
        subject: bundle.subject,
        copy
      });

      const { error: uploadError } = await admin.storage
        .from(POSTER_BUCKET)
        .upload(storagePath, png, { contentType: "image/png" });
      if (uploadError) {
        throw new Error(`POSTER_UPLOAD_FAILED:${uploadError.message}`);
      }

      const { error: insertError } = await admin.from("posters").insert({
        id: posterId,
        restaurant_id: restaurantId,
        template_id: templateId,
        subject_ref: subjectRef,
        copy: { ...copy, variant_index: variantIndex },
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
        variantIndex
      };
    })
  ).catch((error: unknown) => {
    console.error("WhatsOrder poster generate failed", error);
    return null;
  });

  if (!variants) {
    return NextResponse.json(
      { error: "Poster generation failed. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ variants });
}
