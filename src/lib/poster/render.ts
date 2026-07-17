// lib/poster/render.ts
//
// The render-once-and-store pipeline: PosterProps → satori (SVG, 1080×1920)
// → resvg-js (PNG buffer). Runs in a Node.js API route — we store the result
// (Supabase Storage / WhatsApp media upload) rather than rendering per
// request, so @vercel/og's Edge wrapper buys nothing here.

import type { ReactNode } from "react";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

import { getPosterFonts } from "./fonts";
import { bestsellerTemplate } from "./templates/bestseller";
import { offerTemplate } from "./templates/offer";
import type { PosterNode } from "./templates/node";
import {
  POSTER_HEIGHT,
  POSTER_MAX_BYTES,
  POSTER_WIDTH,
  type PosterProps,
  type PosterTemplateId
} from "./types";

const TEMPLATES: Record<PosterTemplateId, (props: PosterProps) => PosterNode> = {
  bestseller: bestsellerTemplate,
  offer: offerTemplate
};

export function buildPosterTree(props: PosterProps): PosterNode {
  return TEMPLATES[props.templateId](props);
}

/** Satori layout+shaping step, exposed separately for snapshot tests. */
export async function renderPosterSvg(props: PosterProps): Promise<string> {
  const fonts = await getPosterFonts();
  // Satori's signature is typed for React elements; it equally accepts
  // React-element-like plain objects (documented satori behavior).
  return satori(buildPosterTree(props) as unknown as ReactNode, {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    fonts
  });
}

export function rasterizePosterSvg(svg: string): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: POSTER_WIDTH }
  });
  return Buffer.from(resvg.render().asPng());
}

export async function renderPosterPng(props: PosterProps): Promise<Buffer> {
  const png = rasterizePosterSvg(await renderPosterSvg(props));
  if (png.byteLength > POSTER_MAX_BYTES) {
    // Should be unreachable at 1080×1920 flat-color layouts; guard the
    // WhatsApp 5 MB image cap anyway rather than ship an unsendable file.
    throw new Error("POSTER_TOO_LARGE");
  }
  return png;
}
