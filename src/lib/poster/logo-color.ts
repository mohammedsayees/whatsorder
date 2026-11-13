// lib/poster/logo-color.ts
//
// Dominant brand colour of a logo, for restaurants that haven't picked a
// poster colour. Ignores transparent, near-white, near-black and grey pixels
// (logo backgrounds and outlines) and returns the most common saturated hue.

import "server-only";

import sharp from "sharp";

import { rgbToHex } from "./palette";

const HUE_BUCKETS = 24;

export async function dominantLogoColor(logoDataUri: string | null | undefined): Promise<string | null> {
  if (!logoDataUri?.startsWith("data:image/")) return null;
  try {
    const buffer = Buffer.from(logoDataUri.split(",")[1] ?? "", "base64");
    const { data, info } = await sharp(buffer)
      .ensureAlpha()
      .resize(48, 48, { fit: "inside" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const buckets = Array.from({ length: HUE_BUCKETS }, () => ({ weight: 0, r: 0, g: 0, b: 0 }));
    for (let i = 0; i < data.length; i += info.channels) {
      const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
      if (a < 128) continue;
      const max = Math.max(r, g, b) / 255;
      const min = Math.min(r, g, b) / 255;
      const l = (max + min) / 2;
      const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
      if (s < 0.25 || l < 0.12 || l > 0.92) continue;
      let h: number;
      const d = max - min;
      const [rn, gn, bn] = [r / 255, g / 255, b / 255];
      if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
      else if (max === gn) h = ((bn - rn) / d + 2) * 60;
      else h = ((rn - gn) / d + 4) * 60;
      const bucket = buckets[Math.floor(h / (360 / HUE_BUCKETS)) % HUE_BUCKETS];
      bucket.weight += s;
      bucket.r += r * s;
      bucket.g += g * s;
      bucket.b += b * s;
    }
    const best = buckets.reduce((top, bucket) => (bucket.weight > top.weight ? bucket : top));
    // Too few coloured pixels: a monochrome logo has no brand hue to borrow.
    if (best.weight < 12) return null;
    return rgbToHex({ r: best.r / best.weight, g: best.g / best.weight, b: best.b / best.weight });
  } catch {
    return null;
  }
}
