// lib/poster/cutout.ts
//
// Turns the image model's "dish on flat magenta" render into a transparent
// PNG cut-out, entirely in code (sharp). The model can't output alpha, so we
// ask for a flat key colour and remove it here, with validation: anything that
// doesn't look like a clean single-colour background is rejected and the
// poster falls back to the photo layouts.

import sharp from "sharp";

export type CutoutResult =
  | { ok: true; png: Buffer; width: number; height: number; keptShare: number }
  | { ok: false; reason: string };

// Distance (RGB Euclidean) below which a pixel is background, and above which
// it is fully dish; in between is a feathered edge.
const KEY_INNER = 70;
const KEY_OUTER = 130;
const OUTPUT_EDGE = 900;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export async function keyOutBackground(input: Buffer): Promise<CutoutResult> {
  let raw: { data: Buffer; info: sharp.OutputInfo };
  try {
    raw = await sharp(input)
      .rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    return { ok: false, reason: "not_an_image" };
  }
  const { data, info } = raw;
  const { width, height } = info;
  const at = (x: number, y: number) => (y * width + x) * 3;

  // 1) Key colour = median of the border pixels.
  const border: [number, number, number][] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 128));
  for (let x = 0; x < width; x += step) {
    for (const y of [0, 1, height - 2, height - 1]) {
      const i = at(x, y);
      border.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  for (let y = 0; y < height; y += step) {
    for (const x of [0, 1, width - 2, width - 1]) {
      const i = at(x, y);
      border.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  const key: [number, number, number] = [
    median(border.map((p) => p[0])),
    median(border.map((p) => p[1])),
    median(border.map((p) => p[2]))
  ];
  // Must actually be magenta-ish (high R and B, low G): never key out a white
  // or grey background, which would eat plates and cups.
  if (!(key[0] > 150 && key[2] > 150 && key[1] < 110)) {
    return { ok: false, reason: "background_not_key_colour" };
  }
  const distance = (r: number, g: number, b: number) =>
    Math.sqrt((r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2);
  const borderOnKey =
    border.filter(([r, g, b]) => distance(r, g, b) < KEY_INNER).length / border.length;
  if (borderOnKey < 0.85) {
    return { ok: false, reason: "background_not_flat" };
  }

  // 2) Alpha from key distance, with spill removal on feathered edges.
  const rgba = Buffer.alloc(width * height * 4);
  let kept = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = at(x, y);
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];
      const d = distance(r, g, b);
      const alpha = d <= KEY_INNER ? 0 : d >= KEY_OUTER ? 1 : (d - KEY_INNER) / (KEY_OUTER - KEY_INNER);
      if (alpha > 0 && alpha < 1) {
        // Unmix the key colour from semi-transparent edge pixels.
        r = (r - (1 - alpha) * key[0]) / alpha;
        g = (g - (1 - alpha) * key[1]) / alpha;
        b = (b - (1 - alpha) * key[2]) / alpha;
      }
      if (alpha > 0) {
        // Magenta spill: red and blue both well above green → pull them down.
        const spill = Math.min(r, b) - g;
        if (spill > 40) {
          r -= spill * 0.5;
          b -= spill * 0.5;
        }
      }
      const o = (y * width + x) * 4;
      rgba[o] = Math.max(0, Math.min(255, Math.round(r)));
      rgba[o + 1] = Math.max(0, Math.min(255, Math.round(g)));
      rgba[o + 2] = Math.max(0, Math.min(255, Math.round(b)));
      rgba[o + 3] = Math.round(alpha * 255);
      if (alpha > 0.5) {
        kept += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  // 3) The dish must be a sensible share of the frame.
  const keptShare = kept / (width * height);
  if (keptShare < 0.08) return { ok: false, reason: "subject_too_small" };
  if (keptShare > 0.85) return { ok: false, reason: "subject_fills_frame" };

  // 4) Trim to the dish (plus a margin for the shadow) and size for posters.
  const margin = Math.round(Math.min(width, height) * 0.03);
  const left = Math.max(0, minX - margin);
  const top = Math.max(0, minY - margin);
  const cropWidth = Math.min(width, maxX + margin + 1) - left;
  const cropHeight = Math.min(height, maxY + margin + 1) - top;
  const png = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(OUTPUT_EDGE, OUTPUT_EDGE, { fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const meta = await sharp(png).metadata();
  return { ok: true, png, width: meta.width ?? 0, height: meta.height ?? 0, keptShare };
}
