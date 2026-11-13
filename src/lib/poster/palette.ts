// lib/poster/palette.ts
//
// Per-restaurant poster palette, built in code from one brand colour (the
// owner's pick or the logo's dominant colour) with a WCAG contrast guarantee:
// every text colour a template uses is chosen against its own background and
// meets at least 4.5:1. Pure: no I/O, no dependencies.

export type Rgb = { r: number; g: number; b: number };

export type PosterPalette = {
  /** Near-black, tinted with the brand hue. */
  dark: string;
  /** Near-white / paper, tinted with the brand hue. */
  light: string;
  /** The brand colour (fills, stamps, accents). */
  primary: string;
  /** A deeper shade of the brand colour. */
  primaryDeep: string;
  /** Warm companion highlight (mustard-like for warm brands). */
  secondary: string;
};

export const MIN_TEXT_CONTRAST = 4.5;

// The food palette used when a restaurant has no brand colour and no usable
// logo colour (the Phase 4 look).
export const DEFAULT_PALETTE: PosterPalette = {
  dark: "#1c1714",
  light: "#fff3df",
  primary: "#e0412f",
  primaryDeep: "#9e2a1f",
  secondary: "#f5b82e"
};

const HEX = /^#?([0-9a-f]{6})$/i;

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(HEX);
  return match ? `#${match[1].toLowerCase()}` : null;
}

export function hexToRgb(hex: string): Rgb {
  const value = parseInt(hex.replace("#", ""), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type Hsl = { h: number; s: number; l: number };

export function hexToHsl(hex: string): Hsl {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/** How far a preferred accent may move in lightness before we give up on it. */
const MAX_ACCENT_SHIFT = 0.3;

/**
 * `preferred`, darkened or lightened (keeping its hue) just enough to reach
 * the minimum contrast against `background`; null if no shade within
 * MAX_ACCENT_SHIFT gets there (a washed-out accent is worse than plain text).
 */
export function adjustForContrast(
  preferred: string,
  background: string,
  minimum = MIN_TEXT_CONTRAST
): string | null {
  if (contrastRatio(preferred, background) >= minimum) return preferred;
  const hsl = hexToHsl(preferred);
  const darker = luminance(background) > 0.18;
  for (let step = 1; step * 0.02 <= MAX_ACCENT_SHIFT; step++) {
    const l = clamp01(hsl.l + (darker ? -1 : 1) * step * 0.02);
    const candidate = hslToHex({ ...hsl, l });
    if (contrastRatio(candidate, background) >= minimum) return candidate;
    if (l === 0 || l === 1) break;
  }
  return null;
}

/**
 * A text colour for `background`: the first preferred colour that reaches
 * 4.5:1 (adjusted in lightness if needed), else whichever of dark/light
 * contrasts best — which always passes for palettes from buildPalette.
 */
export function textOn(
  background: string,
  palette: PosterPalette,
  preferred: string[] = []
): string {
  for (const colour of preferred) {
    if (colour === background) continue;
    const adjusted = adjustForContrast(colour, background);
    if (adjusted) return adjusted;
  }
  return contrastRatio(palette.dark, background) >= contrastRatio(palette.light, background)
    ? palette.dark
    : palette.light;
}

/**
 * Nudge a fill that will carry text out of the mid-luminance band where
 * neither the dark nor the light text colour reaches 4.5:1.
 */
export function textableFill(fill: string, dark: string, light: string): string {
  if (Math.max(contrastRatio(fill, dark), contrastRatio(fill, light)) >= MIN_TEXT_CONTRAST) {
    return fill;
  }
  const hsl = hexToHsl(fill);
  // Move toward whichever end is nearer.
  const lighten = contrastRatio(fill, dark) >= contrastRatio(fill, light);
  for (let step = 1; step <= 50; step++) {
    const candidate = hslToHex({ ...hsl, l: clamp01(hsl.l + (lighten ? 1 : -1) * step * 0.01) });
    if (Math.max(contrastRatio(candidate, dark), contrastRatio(candidate, light)) >= MIN_TEXT_CONTRAST) {
      return candidate;
    }
  }
  return lighten ? light : dark;
}

/**
 * Full palette from one brand colour. Greys and near-black/near-white brands
 * keep a neutral base with the default warm highlight, so the poster still
 * reads as food.
 */
export function buildPalette(brand: string | null | undefined): PosterPalette {
  const hex = normalizeHex(brand);
  if (!hex) return textablePalette(DEFAULT_PALETTE);
  const { h, s, l } = hexToHsl(hex);
  const neutral = s < 0.12 || l < 0.08 || l > 0.94;

  const dark = neutral ? DEFAULT_PALETTE.dark : hslToHex({ h, s: Math.min(s, 0.35), l: 0.09 });
  const light = neutral ? DEFAULT_PALETTE.light : hslToHex({ h, s: Math.min(0.7, s), l: 0.95 });
  const primary = neutral
    ? textableFill(l < 0.5 ? hex : DEFAULT_PALETTE.dark, dark, light)
    : textableFill(hex, dark, light);
  const primaryHsl = hexToHsl(primary);
  const primaryDeep = hslToHex({ ...primaryHsl, l: Math.max(0.16, primaryHsl.l * 0.62) });
  // A bright companion hue that stays appetising: red/pink brands get a
  // mustard highlight, orange/yellow brands a tomato red (never lime), cool
  // brands an analogous light tint.
  const secondary = neutral
    ? DEFAULT_PALETTE.secondary
    : h <= 20 || h >= 300
      ? hslToHex({ h: (h + 38) % 360, s: 0.88, l: 0.56 })
      : h < 70
        ? hslToHex({ h: 6, s: 0.78, l: 0.5 })
        : hslToHex({ h: (h + 330) % 360, s: Math.max(0.55, s), l: 0.72 });

  return textablePalette({ dark, light, primary, primaryDeep, secondary });
}

/** Every fill that can carry text, nudged out of the no-contrast band. */
function textablePalette(palette: PosterPalette): PosterPalette {
  const fill = (colour: string) => textableFill(colour, palette.dark, palette.light);
  return {
    ...palette,
    primary: fill(palette.primary),
    primaryDeep: fill(palette.primaryDeep),
    secondary: fill(palette.secondary)
  };
}
