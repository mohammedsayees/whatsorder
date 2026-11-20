// lib/poster/scheme.ts
//
// The colour scheme of one poster composition: which palette colour fills
// the background, and every text colour picked against its own surface at
// >= 4.5:1. Pure and dependency-free (no fonts, no node APIs), so the admin
// brand-look preview runs the same colour rules in the browser as the
// server-side renderer does.

import { textOn, textableFill, type PosterPalette } from "./palette";
import type { PaletteRole, PosterTheme } from "./themes";

export type PosterField = "hero" | "bleed" | "stat" | "arch" | "price";

/**
 * Every colour a composition uses, resolved from the palette for one field.
 * Text colours are always chosen against the surface they sit on.
 */
export type PosterScheme = {
  palette: PosterPalette;
  bg: string;
  /** Main text on bg. */
  text: string;
  /** Accent text on bg (prices, the sold count) — a brand colour when it passes. */
  accent: string;
  /** Decoration fills (never carry body text). */
  decoA: string;
  decoB: string;
  /** Ring around circular photos. */
  ring: string;
  stampFill: string;
  stampText: string;
  /** Text on decoA, e.g. lettering inside a band or an arch. */
  onDecoA: string;
  /** Accent text on decoA (struck price inside a filled arch). */
  accentOnDecoA: string;
  /** Solid area below a full-bleed photo, and text on it. */
  base: string;
  onBase: string;
  accentOnBase: string;
};

export function schemeFor(palette: PosterPalette, theme: PosterTheme, field: PosterField): PosterScheme {
  const bgRole = theme.fields[field];
  const bg = textableFill(palette[bgRole], palette.dark, palette.light);
  const decoRoles = (["primary", "secondary", "primaryDeep", "dark", "light"] as PaletteRole[]).filter(
    (role) => palette[role] !== bg
  );
  const decoA = textableFill(palette[decoRoles[0]], palette.dark, palette.light);
  const decoB = palette[decoRoles[1]];
  const accents = theme.accents.map((role) => palette[role]);
  // Stamps sit on the field (or a photo); give them a fill that stands out.
  const stampFill = textableFill(bgRole === "dark" ? palette.secondary : decoA, palette.dark, palette.light);
  const base = palette.dark;
  return {
    palette,
    bg,
    text: textOn(bg, palette),
    accent: textOn(bg, palette, accents),
    decoA,
    decoB,
    ring: bgRole === "light" ? palette.dark : palette.light,
    stampFill,
    stampText: textOn(stampFill, palette),
    onDecoA: textOn(decoA, palette),
    accentOnDecoA: textOn(decoA, palette, [palette.secondary, palette.light]),
    base,
    onBase: textOn(base, palette, [palette.light]),
    accentOnBase: textOn(base, palette, accents)
  };
}
