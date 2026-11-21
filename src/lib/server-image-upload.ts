import "server-only";

import sharp from "sharp";

const supportedFormats = new Set(["jpeg", "png", "webp"]);

/**
 * Cache-Control max-age (seconds) for public image uploads whose storage path
 * is unique per upload (`<name>-<Date.now()>.webp`, `upsert: false`). A
 * replaced image always gets a new URL, so browsers, Supabase's CDN and the
 * Vercel image optimizer can keep each file for a year. Do NOT use this for
 * paths that are overwritten in place (e.g. poster art, chat media).
 */
export const IMMUTABLE_UPLOAD_CACHE_SECONDS = "31536000";

export type NormalizedImageUpload = {
  bytes: Buffer;
  contentType: "image/webp";
  extension: "webp";
};

/**
 * Decode, auto-rotate, bound to `maximumEdge` (never upscale) and re-encode
 * as WebP. Throws on anything that is not a real JPG/PNG/WebP.
 */
export async function normalizeImageBuffer(
  source: Buffer,
  options: { maximumEdge: number }
): Promise<NormalizedImageUpload> {
  try {
    const image = sharp(source, {
      failOn: "warning",
      limitInputPixels: 40_000_000
    });
    const metadata = await image.metadata();

    if (!metadata.format || !supportedFormats.has(metadata.format)) {
      throw new Error("Unsupported image format.");
    }

    if (!metadata.width || !metadata.height) {
      throw new Error("Image dimensions could not be read.");
    }

    const bytes = await image
      .rotate()
      .resize({
        width: options.maximumEdge,
        height: options.maximumEdge,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 82 })
      .toBuffer();

    return { bytes, contentType: "image/webp", extension: "webp" };
  } catch {
    throw new Error("The selected file is not a valid JPG, PNG, or WebP image.");
  }
}

export async function normalizeImageUpload(
  file: Pick<File, "arrayBuffer" | "size">,
  options: { maximumBytes: number; maximumEdge: number }
): Promise<NormalizedImageUpload> {
  if (file.size === 0) {
    throw new Error("Please choose an image to upload.");
  }

  if (file.size > options.maximumBytes) {
    throw new Error(
      `Image must be ${Math.round(options.maximumBytes / 1024 / 1024)}MB or smaller.`
    );
  }

  const source = Buffer.from(await file.arrayBuffer());
  return normalizeImageBuffer(source, { maximumEdge: options.maximumEdge });
}
