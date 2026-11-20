// lib/poster/logo-color.ts
//
// Dominant brand colour of a logo, for restaurants that haven't picked a
// poster colour. Ignores transparent, near-white, near-black and grey pixels
// (logo backgrounds and outlines) and returns the most common strong hue.
//
// Pixels are weighted by chroma (max − min channel), not HSL saturation: HSL
// rates pale tints like a peach background (#efd9cc, s ≈ 0.52) as "saturated"
// as a real accent, so a tinted logo background used to win. Strong colours
// are preferred; a pale tint is returned only when the logo has nothing
// stronger (buildPalette then deepens it so it still reads as a brand fill).

import "server-only";

import sharp from "sharp";

import { rgbToHex } from "./palette";

const HUE_BUCKETS = 24;

/** A strong colour: clearly coloured and not a pale tint or near-black. */
const STRONG_MIN_CHROMA = 0.2;
const STRONG_MAX_LIGHTNESS = 0.8;
/** Fallback: any visibly tinted pixel that isn't background white / outline black. */
const TINT_MIN_CHROMA = 0.06;
const TINT_MAX_LIGHTNESS = 0.92;
const MIN_LIGHTNESS = 0.12;
/** Total chroma weight below which a logo has no brand hue worth borrowing. */
const MIN_WEIGHT = 6;

type Bucket = { weight: number; r: number; g: number; b: number };

export async function dominantLogoColor(logoDataUri: string | null | undefined): Promise<string | null> {
  if (!logoDataUri?.startsWith("data:image/")) return null;
  try {
    const buffer = Buffer.from(logoDataUri.split(",")[1] ?? "", "base64");
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .resize(48, 48, { fit: "inside" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const empty = () => Array.from({ length: HUE_BUCKETS }, (): Bucket => ({ weight: 0, r: 0, g: 0, b: 0 }));
    const strong = empty();
    const tint = empty();
    for (let i = 0; i < data.length; i += info.channels) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 128) continue;
      const [rn, gn, bn] = [r / 255, g / 255, b / 255];
      const max = Math.max(rn, gn, bn);
      const min = Math.min(rn, gn, bn);
      const chroma = max - min;
      const l = (max + min) / 2;
      if (chroma < TINT_MIN_CHROMA || l < MIN_LIGHTNESS || l > TINT_MAX_LIGHTNESS) continue;
      let h: number;
      if (max === rn) h = ((gn - bn) / chroma + (gn < bn ? 6 : 0)) * 60;
      else if (max === gn) h = ((bn - rn) / chroma + 2) * 60;
      else h = ((rn - gn) / chroma + 4) * 60;
      const index = Math.floor(h / (360 / HUE_BUCKETS)) % HUE_BUCKETS;
      const isStrong = chroma >= STRONG_MIN_CHROMA && l <= STRONG_MAX_LIGHTNESS;
      const bucket = (isStrong ? strong : tint)[index];
      bucket.weight += chroma;
      bucket.r += r * chroma;
      bucket.g += g * chroma;
      bucket.b += b * chroma;
    }
    // Too few coloured pixels: a monochrome logo has no brand hue to borrow.
    const best = heaviest(strong) ?? heaviest(tint);
    if (!best) return null;
    return rgbToHex({ r: best.r / best.weight, g: best.g / best.weight, b: best.b / best.weight });
  } catch {
    return null;
  }
}

function heaviest(buckets: Bucket[]): Bucket | null {
  const top = buckets.reduce((best, bucket) => (bucket.weight > best.weight ? bucket : best));
  return top.weight >= MIN_WEIGHT ? top : null;
}
