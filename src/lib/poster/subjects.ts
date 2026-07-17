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
};

/**
 * Fetch an image URL and re-encode it as a JPEG data URI sized for embedding.
 * Returns null on any failure (missing, unreachable, low-res, not an image) —
 * null is a designed-for state, not an error.
 */
export async function imageUrlToDataUri(
  url: string | null | undefined
): Promise<string | null> {
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

export async function buildPosterBranding(
  restaurant: Restaurant
): Promise<PosterBranding> {
  return {
    restaurantName: restaurant.name,
    logoDataUri: await imageUrlToDataUri(restaurant.logo_url)
  };
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
  return {
    subject: {
      title: item.name,
      priceLine,
      originalPriceLine: null,
      photoDataUri: await imageUrlToDataUri(item.image_url),
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

  return {
    subject: {
      title: offer.title || item.name,
      priceLine,
      originalPriceLine,
      photoDataUri: await imageUrlToDataUri(item.image_url),
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
