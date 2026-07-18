// lib/poster/types.ts
//
// Poster Studio (Phase 1). Poster Studio is a generator, not an editor: the
// owner picks a template + subject, the server assembles PosterProps from live
// tenant data and AI copy, and the pipeline renders a fixed-layout PNG. No
// layout/font/color input ever crosses this boundary.

export const POSTER_TEMPLATE_IDS = ["bestseller", "offer"] as const;
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

// All v1 templates are WhatsApp-status-first: 9:16 vertical.
export const POSTER_WIDTH = 1080;
export const POSTER_HEIGHT = 1920;

// WhatsApp rejects images above 5 MB; the render pipeline enforces this cap.
export const POSTER_MAX_BYTES = 5 * 1024 * 1024;

// Private storage bucket; objects live at {restaurant_id}/{poster_id}.png.
export const POSTER_BUCKET = "posters";

/** What the owner picked. Exactly one id is set, matching template_id. */
export type PosterSubjectRef =
  | { menu_item_id: string }
  | { offer_id: string };

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
  /** Logo as a base64 data URI; null → name set in Bricolage Grotesque 700. */
  logoDataUri: string | null;
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
  /** Item photo as a base64 data URI; null → typographic variant. */
  photoDataUri: string | null;
  /** Units sold in the window get_bestsellers looked at; 0 on cold start. */
  soldQty: number | null;
};

export type PosterProps = {
  templateId: PosterTemplateId;
  layout: PosterLayoutId;
  branding: PosterBranding;
  subject: PosterSubject;
  copy: PosterCopy;
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
  copy: PosterCopy & { variant_index: number; layout?: PosterLayoutId };
  storage_path: string;
  status: PosterStatus;
  created_at: string;
};

// WhatsOrder brand palette (tailwind.config.ts) — pine/amber/cream family.
// Templates use these fixed values; tenants supply only logo + data.
export const POSTER_COLORS = {
  ink: "#17201b",
  pine: "#1f8a5b",
  mint: "#e8f7ef",
  cream: "#f7f1e8",
  amber: "#f6b642"
} as const;
