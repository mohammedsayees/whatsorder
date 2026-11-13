import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { preparePosterPhoto } from "./subjects";

async function dimensions(dataUri: string) {
  const buffer = Buffer.from(dataUri.split(",")[1], "base64");
  return sharp(buffer).metadata();
}

describe("preparePosterPhoto", () => {
  it("returns square and tall smart-cropped JPEGs", async () => {
    const source = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: { r: 200, g: 120, b: 60 } }
    })
      .jpeg()
      .toBuffer();
    const set = await preparePosterPhoto(source);
    expect(set).not.toBeNull();
    const square = await dimensions(set!.square);
    const tall = await dimensions(set!.tall);
    expect([square.format, square.width, square.height]).toEqual(["jpeg", 1080, 1080]);
    expect([tall.format, tall.width, tall.height]).toEqual(["jpeg", 1080, 1400]);
  });

  it("lifts saturation a little", async () => {
    const source = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 180, g: 130, b: 100 } }
    })
      .jpeg()
      .toBuffer();
    const set = await preparePosterPhoto(source);
    const { data } = await sharp(Buffer.from(set!.square.split(",")[1], "base64"))
      .resize(1, 1)
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Wider R–B spread than the 80-point source means more saturation.
    expect(data[0] - data[2]).toBeGreaterThan(80);
  });

  it("treats missing or tiny images as no photo", async () => {
    expect(await preparePosterPhoto(null)).toBeNull();
    const tiny = await sharp({
      create: { width: 120, height: 120, channels: 3, background: { r: 1, g: 2, b: 3 } }
    })
      .png()
      .toBuffer();
    expect(await preparePosterPhoto(tiny)).toBeNull();
    expect(await preparePosterPhoto(Buffer.from("not an image"))).toBeNull();
  });
});
