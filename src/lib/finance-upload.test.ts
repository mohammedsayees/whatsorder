import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { inspectFinanceUpload } from "./finance-upload";

function uploadedFile(bytes: Buffer, name = "bill.png") {
  return {
    name,
    size: bytes.byteLength,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer as ArrayBuffer
  } as File;
}

describe("finance document upload inspection", () => {
  it("validates and normalizes image bytes independent of the filename", async () => {
    const source = await sharp({
      create: { width: 100, height: 200, channels: 3, background: "white" }
    }).png().toBuffer();
    const inspected = await inspectFinanceUpload(uploadedFile(source, "bill<script>.jpg"));
    expect(inspected.contentType).toBe("image/webp");
    expect(inspected.extension).toBe("webp");
    expect(inspected.originalName).not.toContain("<");
    expect(inspected.originalHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a fake image even when its name looks valid", async () => {
    await expect(inspectFinanceUpload(uploadedFile(Buffer.from("not an image"))))
      .rejects.toThrow("not a valid JPG, PNG, or WebP image");
  });

  it("rejects invalid PDF magic as image content", async () => {
    await expect(inspectFinanceUpload(uploadedFile(Buffer.from("%PDX-broken"), "bill.pdf")))
      .rejects.toThrow("not a valid JPG, PNG, or WebP image");
  });
});
