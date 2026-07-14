import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { normalizeImageUpload } from "./server-image-upload";

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
