import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  IMMUTABLE_UPLOAD_CACHE_SECONDS,
  normalizeImageBuffer,
  normalizeImageUpload
} from "./server-image-upload";

describe("normalizeImageBuffer", () => {
  it("turns a full-size generated PNG into a much smaller bounded WebP", async () => {
    // Photo-like: smooth gradients plus a little sensor grain, which PNG
    // stores poorly and lossy WebP stores well (like the model's output).
    const size = 1_024;
    const pixels = Buffer.alloc(size * size * 3);
    let seed = 12_345;
    const grain = () => {
      seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
      return 8 * (seed / 0x7fffffff - 0.5);
    };
    const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const offset = (y * size + x) * 3;
        const noise = grain();
        pixels[offset] = channel(128 + 100 * Math.sin(x / 90) + noise);
        pixels[offset + 1] = channel(128 + 90 * Math.cos(y / 70) + noise);
        pixels[offset + 2] = channel(128 + 60 * Math.sin((x + y) / 120) + noise);
      }
    }
    const png = await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
      .png()
      .toBuffer();

    const normalized = await normalizeImageBuffer(png, { maximumEdge: 800 });
    const metadata = await sharp(normalized.bytes).metadata();

    expect(normalized.contentType).toBe("image/webp");
    expect(metadata.format).toBe("webp");
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBe(800);
    expect(normalized.bytes.byteLength).toBeLessThan(png.byteLength / 2);
  });

  it("never upscales a small image", async () => {
    const small = await sharp({
      create: { width: 300, height: 200, channels: 3, background: "#aa5500" }
    })
      .png()
      .toBuffer();
    const metadata = await sharp(
      (await normalizeImageBuffer(small, { maximumEdge: 1_200 })).bytes
    ).metadata();

    expect(metadata.width).toBe(300);
    expect(metadata.height).toBe(200);
  });

  it("rejects bytes that are not an image", async () => {
    await expect(
      normalizeImageBuffer(Buffer.from("not an image"), { maximumEdge: 800 })
    ).rejects.toThrow("not a valid JPG, PNG, or WebP");
  });

  it("caches unique-path uploads for a year", () => {
    expect(Number(IMMUTABLE_UPLOAD_CACHE_SECONDS)).toBe(365 * 24 * 60 * 60);
  });
});

function uploadedFile(bytes: Buffer) {
  return {
    size: bytes.byteLength,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer as ArrayBuffer
  };
}

describe("normalizeImageUpload", () => {
  it("decodes, bounds, and re-encodes a valid image as WebP", async () => {
    const source = await sharp({
      create: {
        width: 2_000,
        height: 1_000,
        channels: 3,
        background: "#006633"
      }
    })
      .png()
      .toBuffer();

    const normalized = await normalizeImageUpload(uploadedFile(source), {
      maximumBytes: 2 * 1024 * 1024,
      maximumEdge: 1_200
    });
    const metadata = await sharp(normalized.bytes).metadata();

    expect(normalized.contentType).toBe("image/webp");
    expect(normalized.extension).toBe("webp");
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(1_200);
    expect(metadata.height).toBe(600);
  });

  it("rejects content that merely claims to be an image", async () => {
    await expect(
      normalizeImageUpload(uploadedFile(Buffer.from("<script>alert(1)</script>")), {
        maximumBytes: 2 * 1024 * 1024,
        maximumEdge: 1_200
      })
    ).rejects.toThrow("not a valid JPG, PNG, or WebP image");
  });

  it("rejects oversized uploads before decoding", async () => {
    const fake = {
      size: 3 * 1024 * 1024,
      arrayBuffer: async () => new ArrayBuffer(0)
    };

    await expect(
      normalizeImageUpload(fake, {
        maximumBytes: 2 * 1024 * 1024,
        maximumEdge: 1_200
      })
    ).rejects.toThrow("2MB or smaller");
  });
});
