// lib/poster/subjects.ts
//
// Assembles PosterProps ingredients from live tenant data (service role,
// always scoped by restaurant_id). Prices are formatted here, server-side,
// from the menu/offers tables — poster price text never passes through the
// LLM. Images are normalized to base64 JPEG data URIs so Satori does no I/O.

import "server-only";

import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";

import { formatCurrency } from "@/lib/currency";
import { getRestaurantLocalization } from "@/lib/localization";
import { isOfferOrderable } from "@/lib/order-pricing";
import type { MenuItem, MenuOffer, Restaurant } from "@/lib/types";

import type { PosterCopyFacts } from "./copy";
import { dominantLogoColor } from "./logo-color";
import { savingStampLabel, trimWholeAmount } from "./offer-math";
import { buildPalette, normalizeHex, type PosterPalette } from "./palette";
import { DEFAULT_POSTER_THEME, isPosterThemeId } from "./themes";
import type {
  PosterBranding,
  PosterSubject,
  PosterSubjectRef,
  PosterTemplateId
} from "./types";

// Photos below this edge look broken blown up to a 1080px window — treat as
// missing and let the typographic variant carry the poster instead.
const MIN_PHOTO_EDGE = 200;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const EMBED_MAX_EDGE = 1200;

export type PosterSubjectBundle = {
  subject: PosterSubject;
  facts: Omit<PosterCopyFacts, "templateId">;
  /** What AI artwork (art.ts) would be made from. Never sent to the copy model. */
  art: {
    menuItemId: string;
    imageUrl: string | null;
    productName: string;
    categoryName: string;
    hasPhoto: boolean;
  };
};

async function categoryName(
  admin: SupabaseClient,
  restaurantId: string,
  categoryId: string | null | undefined
): Promise<string> {
  if (!categoryId) return "Menu";
  const { data } = await admin
    .from("menu_categories")
    .select("name")
    .eq("restaurant_id", restaurantId)
    .eq("id", categoryId)
    .maybeSingle();
  return (data as { name?: string } | null)?.name ?? "Menu";
}

export async function fetchImageBytes(url: string | null | undefined): Promise<Buffer | null> {
  if (!url || !/^https?:\/\//.test(url)) {
    return null;
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      return null;
    }
    const source = Buffer.from(await response.arrayBuffer());
    if (source.byteLength === 0 || source.byteLength > MAX_SOURCE_BYTES) {
      return null;
    }
    return source;
  } catch {
    return null;
  }
}

// Food-photo treatment: a modest saturation/contrast lift so dishes read as
// appetising on a phone screen, never a filter look.
const PHOTO_SATURATION = 1.15;
const PHOTO_BRIGHTNESS = 1.03;
const PHOTO_CONTRAST = 1.08;

export type PosterPhotoSet = { square: string; tall: string };

/**
 * Owner photo → two smart-cropped, lightly enhanced JPEG data URIs: a square
 * one (circle / arch / window layouts) and a tall one (full-bleed). Cropping
 * uses sharp's attention strategy, which centres on the most salient region
 * (usually the dish) instead of the geometric centre. Null on any failure.
 */
export async function preparePosterPhoto(
  source: Buffer | null
): Promise<PosterPhotoSet | null> {
  if (!source) {
    return null;
  }
  try {
    const base = sharp(source, { limitInputPixels: 40_000_000 }).rotate();
    const metadata = await base.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      Math.min(metadata.width, metadata.height) < MIN_PHOTO_EDGE
    ) {
      return null;
    }
    const enhanced = base
      .clone()
      .modulate({ saturation: PHOTO_SATURATION, brightness: PHOTO_BRIGHTNESS })
      .linear(PHOTO_CONTRAST, -128 * (PHOTO_CONTRAST - 1));
    const crop = (width: number, height: number) =>
      enhanced
        .clone()
        .resize({
          width,
          height,
          fit: "cover",
          position: sharp.strategy.attention
        })
        .jpeg({ quality: 84 })
        .toBuffer();
    const [square, tall] = await Promise.all([crop(1080, 1080), crop(1080, 1400)]);
    return {
      square: `data:image/jpeg;base64,${square.toString("base64")}`,
      tall: `data:image/jpeg;base64,${tall.toString("base64")}`
    };
  } catch {
    return null;
  }
}

/**
 * Fetch an image URL (logos) and re-encode it as a JPEG data URI sized for
 * embedding, untouched otherwise. Returns null on any failure (missing,
 * unreachable, low-res, not an image) — null is a designed-for state.
 */
export async function imageUrlToDataUri(
  url: string | null | undefined
): Promise<string | null> {
  const source = await fetchImageBytes(url);
  if (!source) {
    return null;
  }
  try {
    const image = sharp(source, { limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      Math.min(metadata.width, metadata.height) < MIN_PHOTO_EDGE
    ) {
      return null;
    }
    const jpeg = await image
      .rotate()
      .resize({
        width: EMBED_MAX_EDGE,
        height: EMBED_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true
      })
      .jpeg({ quality: 84 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Logo for posters: PNG (keeps transparency), at most 480px on an edge. */
async function logoUrlToDataUri(url: string | null | undefined): Promise<string | null> {
  const source = await fetchImageBytes(url);
  if (!source) {
    return null;
  }
  try {
    const png = await sharp(source, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export type PaletteSource = "brand_color" | "logo" | "default";

/**
 * The restaurant's poster palette: its chosen brand colour, else its logo's
 * dominant colour, else the default food palette.
 */
export async function resolvePosterPalette(
  restaurant: Pick<Restaurant, "poster_brand_color">,
  logoDataUri: string | null
): Promise<{ palette: PosterPalette; source: PaletteSource; seed: string | null }> {
  const chosen = normalizeHex(restaurant.poster_brand_color);
  if (chosen) {
    return { palette: buildPalette(chosen), source: "brand_color", seed: chosen };
  }
  const fromLogo = await dominantLogoColor(logoDataUri);
  if (fromLogo) {
    return { palette: buildPalette(fromLogo), source: "logo", seed: fromLogo };
  }
  return { palette: buildPalette(null), source: "default", seed: null };
}

export async function buildPosterBranding(
  restaurant: Restaurant
): Promise<PosterBranding> {
  const logoDataUri = await logoUrlToDataUri(restaurant.logo_url);
  const { palette } = await resolvePosterPalette(restaurant, logoDataUri);
  return {
    restaurantName: restaurant.name,
    logoDataUri,
    palette,
    theme: isPosterThemeId(restaurant.poster_theme) ? restaurant.poster_theme : DEFAULT_POSTER_THEME
  };
}

/** For the settings preview: the palette posters will use right now. */
export async function previewPosterPalette(
  restaurant: Pick<Restaurant, "poster_brand_color" | "logo_url">
) {
  return resolvePosterPalette(restaurant, await logoUrlToDataUri(restaurant.logo_url));
}

function marketLabel(restaurant: Restaurant): string {
  return getRestaurantLocalization(restaurant).country_code === "IN"
    ? "India"
    : "the UAE";
}

async function fetchMenuItem(
  admin: SupabaseClient,
  restaurantId: string,
  menuItemId: string
): Promise<MenuItem | null> {
  const { data, error } = await admin
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("id", menuItemId)
    .maybeSingle();
  if (error) {
    console.error("WhatsOrder poster: menu item read failed", error.code);
    return null;
  }
  return (data as MenuItem | null) ?? null;
}

async function buildBestsellerSubject(
  admin: SupabaseClient,
  restaurant: Restaurant,
  menuItemId: string
): Promise<PosterSubjectBundle | null> {
  const item = await fetchMenuItem(admin, restaurant.id, menuItemId);
  if (!item || !item.is_available) {
    return null;
  }

  let soldQty: number | null = null;
  const { data: bestsellers, error } = await admin.rpc("get_bestsellers", {
    rid: restaurant.id,
    window_days: 30,
    limit_n: 25
  });
  if (error) {
    console.error("WhatsOrder poster: get_bestsellers failed", error.code);
  } else if (Array.isArray(bestsellers)) {
    const match = (
      bestsellers as { menu_item_id: string; qty: number | string }[]
    ).find((row) => row.menu_item_id === item.id);
    const qty = match ? Math.floor(Number(match.qty)) : 0;
    soldQty = Number.isFinite(qty) && qty > 0 ? qty : null;
  }

  const priceLine = formatCurrency(item.price, restaurant);
  const [photo, category] = await Promise.all([
    fetchImageBytes(item.image_url).then(preparePosterPhoto),
    categoryName(admin, restaurant.id, item.category_id)
  ]);
  return {
    art: {
      menuItemId: item.id,
      imageUrl: photo ? item.image_url : null,
      productName: item.name,
      categoryName: category,
      hasPhoto: Boolean(photo)
    },
    subject: {
      title: item.name,
      priceLine: trimWholeAmount(priceLine),
      originalPriceLine: null,
      savingLabel: null,
      photoDataUri: photo?.square ?? null,
      photoTallDataUri: photo?.tall ?? null,
      soldQty
    },
    facts: {
      restaurantName: restaurant.name,
      itemName: item.name,
      priceLines: [priceLine],
      soldQty,
      market: marketLabel(restaurant)
    }
  };
}

async function buildOfferSubject(
  admin: SupabaseClient,
  restaurant: Restaurant,
  offerId: string
): Promise<PosterSubjectBundle | null> {
  const { data, error } = await admin
    .from("menu_offers")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .eq("id", offerId)
    .maybeSingle();
  if (error || !data) {
    if (error) {
      console.error("WhatsOrder poster: offer read failed", error.code);
    }
    return null;
  }
  const offer = data as MenuOffer;
  if (!isOfferOrderable(offer)) {
    return null;
  }

  const item = await fetchMenuItem(admin, restaurant.id, offer.menu_item_id);
  if (!item) {
    return null;
  }

  // Offer text verbatim from the offers table: promotional price leads; the
  // item's regular price appears struck through only when it's a real cut.
  const priceLine = formatCurrency(offer.promotional_price, restaurant);
  const originalPriceLine =
    item.price > offer.promotional_price
      ? formatCurrency(item.price, restaurant)
      : null;

  const [photo, category] = await Promise.all([
    fetchImageBytes(item.image_url).then(preparePosterPhoto),
    categoryName(admin, restaurant.id, item.category_id)
  ]);
  return {
    art: {
      menuItemId: item.id,
      imageUrl: photo ? item.image_url : null,
      productName: item.name,
      categoryName: category,
      hasPhoto: Boolean(photo)
    },
    subject: {
      title: offer.title || item.name,
      priceLine: trimWholeAmount(priceLine),
      originalPriceLine: originalPriceLine ? trimWholeAmount(originalPriceLine) : null,
      savingLabel: savingStampLabel(item.price, offer.promotional_price, (amount) =>
        formatCurrency(amount, restaurant)
      ),
      photoDataUri: photo?.square ?? null,
      photoTallDataUri: photo?.tall ?? null,
      soldQty: null
    },
    facts: {
      restaurantName: restaurant.name,
      itemName: offer.title || item.name,
      priceLines: originalPriceLine
        ? [priceLine, originalPriceLine]
        : [priceLine],
      soldQty: null,
      market: marketLabel(restaurant)
    }
  };
}

/**
 * Resolve the owner's template + subject pick into render-ready subject data.
 * Null → the subject doesn't exist for this tenant (or isn't currently
 * sellable), which the API surfaces as a 404.
 */
export async function buildPosterSubjectBundle(
  admin: SupabaseClient,
  restaurant: Restaurant,
  templateId: PosterTemplateId,
  subjectRef: PosterSubjectRef
): Promise<PosterSubjectBundle | null> {
  if (templateId === "bestseller" && "menu_item_id" in subjectRef) {
    return buildBestsellerSubject(admin, restaurant, subjectRef.menu_item_id);
  }
  if (templateId === "offer" && "offer_id" in subjectRef) {
    return buildOfferSubject(admin, restaurant, subjectRef.offer_id);
  }
  return null;
}
