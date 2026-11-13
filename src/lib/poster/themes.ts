// lib/poster/themes.ts
//
// Poster themes: named looks that change type, shapes and decoration — not
// just colour. Colours always come from the restaurant's palette (palette.ts);
// a theme only decides which palette roles go where.

import type { PosterPalette } from "./palette";

export const POSTER_THEME_IDS = [
  "street_food",
  "bold_deal",
  "minimal_cafe",
  "dark_premium"
] as const;
export type PosterThemeId = (typeof POSTER_THEME_IDS)[number];
export const DEFAULT_POSTER_THEME: PosterThemeId = "street_food";

export function isPosterThemeId(value: unknown): value is PosterThemeId {
  return typeof value === "string" && (POSTER_THEME_IDS as readonly string[]).includes(value);
}

export type PaletteRole = keyof PosterPalette;

export type PosterTheme = {
  id: PosterThemeId;
  label: string;
  description: string;
  display: {
    family: string;
    weight: 400 | 700;
    transform: "uppercase" | "none";
    /** Average advance per character, in em, for the fitting estimate. */
    charEm: number;
    lineHeight: number;
    /** Multiplier on layout headline sizes (serif/sentence case runs wider). */
    sizeScale: number;
  };
  /** Shape of the sold-count / saving stamp. */
  stamp: "starburst" | "tag" | "badge" | "seal";
  /** Background texture. */
  texture: "dots" | "stripes" | "grid" | "hairline";
  /** Decorative discs and rings drawn filled or as outlines. */
  ornament: "solid" | "outline";
  /** Inset hairline frame around the poster. */
  frame: boolean;
  /** Background role per composition. */
  fields: {
    hero: PaletteRole;
    bleed: PaletteRole;
    stat: PaletteRole;
    arch: PaletteRole;
    /** Offer price-led composition. */
    price: PaletteRole;
  };
  /** Preference order for accent text (prices, the sold count). */
  accents: PaletteRole[];
};

export const POSTER_THEMES: Record<PosterThemeId, PosterTheme> = {
  street_food: {
    id: "street_food",
    label: "Street food",
    description: "Loud and warm: condensed caps, starburst stamps, halftone dots.",
    display: { family: "Anton, Cairo", weight: 400, transform: "uppercase", charEm: 0.5, lineHeight: 0.98, sizeScale: 1 },
    stamp: "starburst",
    texture: "dots",
    ornament: "solid",
    frame: false,
    fields: { hero: "secondary", bleed: "dark", stat: "primary", arch: "light", price: "dark" },
    accents: ["primary", "primaryDeep", "secondary"]
  },
  bold_deal: {
    id: "bold_deal",
    label: "Bold deal",
    description: "Built to sell: brand-colour fields, price tags, diagonal stripes.",
    display: { family: "Anton, Cairo", weight: 400, transform: "uppercase", charEm: 0.5, lineHeight: 0.94, sizeScale: 1.05 },
    stamp: "tag",
    texture: "stripes",
    ornament: "solid",
    frame: false,
    fields: { hero: "primary", bleed: "dark", stat: "secondary", arch: "secondary", price: "primary" },
    accents: ["secondary", "light", "primaryDeep"]
  },
  minimal_cafe: {
    id: "minimal_cafe",
    label: "Minimal café",
    description: "Calm and airy: sentence-case type, outline shapes, light paper.",
    display: { family: "Bricolage Grotesque, Cairo", weight: 700, transform: "none", charEm: 0.6, lineHeight: 1.02, sizeScale: 0.82 },
    stamp: "badge",
    texture: "grid",
    ornament: "outline",
    frame: false,
    fields: { hero: "light", bleed: "light", stat: "light", arch: "light", price: "light" },
    accents: ["primary", "primaryDeep"]
  },
  dark_premium: {
    id: "dark_premium",
    label: "Dark premium",
    description: "Evening menu: serif headlines, dark fields, hairline frame and seal.",
    display: { family: "DM Serif Display, Cairo", weight: 400, transform: "none", charEm: 0.58, lineHeight: 1.02, sizeScale: 0.9 },
    stamp: "seal",
    texture: "hairline",
    ornament: "outline",
    frame: true,
    fields: { hero: "dark", bleed: "dark", stat: "dark", arch: "dark", price: "dark" },
    accents: ["secondary", "light"]
  }
};

/**
 * The themes for one generation: every variant in the owner's default theme,
 * or ("mix") one variant per theme starting with the default.
 */
export function themesForGeneration(
  defaultTheme: PosterThemeId,
  mode: "default" | "mix",
  count: number
): PosterThemeId[] {
  if (mode !== "mix") return Array.from({ length: count }, () => defaultTheme);
  const order = [defaultTheme, ...POSTER_THEME_IDS.filter((id) => id !== defaultTheme)];
  return Array.from({ length: count }, (_, index) => order[index % order.length]);
}
