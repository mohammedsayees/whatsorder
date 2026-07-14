import "server-only";

import sharp from "sharp";

const supportedFormats = new Set(["jpeg", "png", "webp"]);

export type NormalizedImageUpload = {
  bytes: Buffer;
  contentType: "image/webp";
  extension: "webp";
};

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
