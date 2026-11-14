// lib/poster/types.ts
//
import type { PosterPalette } from "./palette";
import type { FestivalId } from "./festivals";
import type { PosterThemeId } from "./themes";

// Poster Studio (Phase 1). Poster Studio is a generator, not an editor: the
// owner picks a template + subject, the server assembles PosterProps from live
// tenant data and AI copy, and the pipeline renders a fixed-layout PNG. No
// layout/font/color input ever crosses this boundary.

export const POSTER_TEMPLATE_IDS = [
  "bestseller",
  "offer",
  "new_item",
  "loyalty",
  "festival"
] as const;
export type PosterTemplateId = (typeof POSTER_TEMPLATE_IDS)[number];

export function isPosterTemplateId(value: unknown): value is PosterTemplateId {
  return (
    typeof value === "string" &&
    (POSTER_TEMPLATE_IDS as readonly string[]).includes(value)
  );
}

// Compositions. Each generated variant slot gets a different one, so one
// generation yields three visually distinct posters — variety is the
// system's job, never an owner control. Interpretation is per-template:
// stat_led leads with the sold count (bestseller) or the price (offer).
// Every layout has a photo-less fallback on a distinct color field, so even
// a café with no photos gets three different designs.
export const POSTER_LAYOUT_IDS = ["photo_hero", "full_bleed", "stat_led"] as const;
export type PosterLayoutId = (typeof POSTER_LAYOUT_IDS)[number];

export function layoutForVariant(variantIndex: number): PosterLayoutId {
  return POSTER_LAYOUT_IDS[
    ((variantIndex % POSTER_LAYOUT_IDS.length) + POSTER_LAYOUT_IDS.length) %
      POSTER_LAYOUT_IDS.length
  ];
}

// Formats: 9:16 (WhatsApp status / stories), 4:5 (feed) and 1:1 (square).
// Each composition is laid out per format (templates/frames.ts), not scaled.
export const POSTER_FORMATS = ["story", "portrait", "square"] as const;
export type PosterFormat = (typeof POSTER_FORMATS)[number];

export function isPosterFormat(value: unknown): value is PosterFormat {
  return typeof value === "string" && (POSTER_FORMATS as readonly string[]).includes(value);
}

export const POSTER_FORMAT_SIZES: Record<PosterFormat, { width: number; height: number; label: string }> = {
  story: { width: 1080, height: 1920, label: "Story 9:16" },
  portrait: { width: 1080, height: 1350, label: "Feed 4:5" },
  square: { width: 1080, height: 1080, label: "Square 1:1" }
};

export const POSTER_WIDTH = 1080;
/** Height of the default (story) format. */
export const POSTER_HEIGHT = 1920;

// WhatsApp rejects images above 5 MB; the render pipeline enforces this cap.
export const POSTER_MAX_BYTES = 5 * 1024 * 1024;

// Private storage bucket; objects live at {restaurant_id}/{poster_id}.png.
export const POSTER_BUCKET = "posters";

/** What the owner picked, matching template_id. */
export type PosterSubjectRef =
  | { menu_item_id: string }
  | { offer_id: string }
  | { loyalty: true }
  | { festival: FestivalId; menu_item_id?: string };

/** Poster language: English, or Arabic for Arabic-speaking audiences. */
export type PosterLanguage = "en" | "ar";

/** AI-written copy. Caps are enforced at generation AND validated in code. */
export type PosterCopy = {
  /** ≤ 38 chars */
  headline: string;
  /** ≤ 70 chars */
  subline: string;
  /** ≤ 160 chars — WhatsApp caption, not rendered on the poster itself. */
  caption: string;
};

export type PosterBranding = {
  restaurantName: string;
  /** Logo as a base64 data URI; null → the name alone carries the brand. */
  logoDataUri: string | null;
  /**
   * The restaurant's poster palette (palette.ts): from its brand colour, else
   * its logo's dominant colour, else the default food palette.
   */
  palette?: PosterPalette;
  /** The look for this poster; defaults to street_food. */
  theme?: PosterThemeId;
};

export type PosterSubject = {
  /** Item or offer title, verbatim from tenant data. */
  title: string;
  /**
   * Price text rendered on the poster, formatted server-side from the
   * menu/offers tables — the LLM never produces or edits prices.
   */
  priceLine: string | null;
  /** Pre-offer price for strikethrough display (offer template only). */
  originalPriceLine: string | null;
  /**
   * Saving stamp ("25% OFF" / "SAVE AED 4"), computed in code from the real
   * regular and promotional prices (offer-math.ts); null when there's no cut.
   */
  savingLabel?: string | null;
  /** Item photo as a base64 data URI (square, smart-cropped); null → typographic variant. */
  photoDataUri: string | null;
  /** Same photo smart-cropped tall for full-bleed layouts; falls back to photoDataUri. */
  photoTallDataUri?: string | null;
  /** AI studio cut-out of the dish (transparent PNG), when one is cached. */
  cutoutDataUri?: string | null;
  /** AI illustrated background for a photo-less item, when one is cached. */
  backgroundDataUri?: string | null;
  /** Units sold in the window get_bestsellers looked at; 0 on cold start. */
  soldQty: number | null;
  /** Loyalty template: the restaurant's real stamp-card terms. */
  loyalty?: { stamps: number; reward: string } | null;
  /** Festival template: the occasion picked by the owner. */
  festival?: FestivalId | null;
};

export type PosterCallToAction = {
  /** QR code (PNG data URI) of the poster's tracked store link; null → no QR. */
  qrDataUri: string | null;
};

export type PosterProps = {
  templateId: PosterTemplateId;
  layout: PosterLayoutId;
  /** Defaults to story (9:16). */
  format?: PosterFormat;
  /** Copy language; decides which festival greeting leads. Defaults to en. */
  language?: PosterLanguage;
  branding: PosterBranding;
  subject: PosterSubject;
  copy: PosterCopy;
  cta?: PosterCallToAction;
};

export type PosterStatus =
  | "rendered"
  | "sent_window"
  | "broadcast_queued"
  | "broadcast_sent";

/** Row shape of public.posters (service-role writes, member reads). */
export type PosterRow = {
  id: string;
  restaurant_id: string;
  template_id: PosterTemplateId;
  subject_ref: PosterSubjectRef;
  copy: PosterCopy & {
    variant_index: number;
    layout?: PosterLayoutId;
    theme?: PosterThemeId;
    format?: PosterFormat;
    language?: PosterLanguage;
  };
  storage_path: string;
  status: PosterStatus;
  created_at: string;
};
