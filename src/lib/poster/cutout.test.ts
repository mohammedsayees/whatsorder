import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { keyOutBackground } from "./cutout";

const dishOn = (background: string, extra = "") =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="${background}"/>${extra}<ellipse cx="300" cy="340" rx="200" ry="90" fill="#efe6d8"/><rect x="200" y="200" width="200" height="150" fill="#f6f1e8"/><ellipse cx="300" cy="202" rx="100" ry="30" fill="#a0592a"/></svg>`
    )
  )
    .png()
    .toBuffer();

async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

describe("keyOutBackground", () => {
  it("removes a flat magenta background and keeps the dish (white cup included)", async () => {
    const result = await keyOutBackground(await dishOn("#ff00ff"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const meta = await sharp(result.png).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);
    // Corner: fully transparent. Centre (the white cup): fully opaque, not magenta.
    expect((await pixel(result.png, 2, 2))[3]).toBe(0);
    const centre = await pixel(result.png, Math.round(result.width / 2), Math.round(result.height / 2));
    expect(centre[3]).toBe(255);
    expect(centre[1]).toBeGreaterThan(200);
  });

  it("tolerates a slightly off key colour", async () => {
    expect((await keyOutBackground(await dishOn("#f20aef"))).ok).toBe(true);
  });

  it("never keys out a white or grey background (it would eat plates and cups)", async () => {
    expect(await keyOutBackground(await dishOn("#ffffff"))).toEqual({ ok: false, reason: "background_not_key_colour" });
    expect(await keyOutBackground(await dishOn("#808080"))).toEqual({ ok: false, reason: "background_not_key_colour" });
  });

  it("rejects a busy background", async () => {
    const stripes = Array.from({ length: 30 }, (_, i) => `<rect x="${i * 20}" y="0" width="10" height="600" fill="#20a040"/>`).join("");
    expect((await keyOutBackground(await dishOn("#ff00ff", stripes))).ok).toBe(false);
  });

  it("rejects a tiny subject or one that fills the frame", async () => {
    const tiny = await sharp(
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#ff00ff"/><circle cx="300" cy="300" r="20" fill="#8a4a1c"/></svg>`)
    ).png().toBuffer();
    expect(await keyOutBackground(tiny)).toEqual({ ok: false, reason: "subject_too_small" });
    const full = await sharp(
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#ff00ff"/><rect x="8" y="8" width="584" height="584" fill="#8a4a1c"/></svg>`)
    ).png().toBuffer();
    expect(await keyOutBackground(full)).toEqual({ ok: false, reason: "subject_fills_frame" });
  });

  it("rejects non-images", async () => {
    expect(await keyOutBackground(Buffer.from("nope"))).toEqual({ ok: false, reason: "not_an_image" });
  });
});
