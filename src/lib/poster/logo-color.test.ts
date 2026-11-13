import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { dominantLogoColor } from "./logo-color";
import { hexToHsl } from "./palette";

async function logo(svg: string) {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

describe("dominantLogoColor", () => {
  it("finds the brand hue and ignores a white background and black outline", async () => {
    const uri = await logo(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#ffffff"/><circle cx="100" cy="100" r="70" fill="#1d4ed8" stroke="#000" stroke-width="10"/></svg>`
    );
    const colour = await dominantLogoColor(uri);
    expect(colour).not.toBeNull();
    expect(Math.abs(hexToHsl(colour!).h - hexToHsl("#1d4ed8").h)).toBeLessThan(8);
  });

  it("ignores transparent pixels", async () => {
    const uri = await logo(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="60" fill="#d62828"/></svg>`
    );
    const colour = await dominantLogoColor(uri);
    expect(hexToHsl(colour!).h < 15 || hexToHsl(colour!).h > 345).toBe(true);
  });

  it("returns null for monochrome logos and bad input", async () => {
    const mono = await logo(
      `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#fff"/><text x="20" y="120" font-size="90">CX</text></svg>`
    );
    expect(await dominantLogoColor(mono)).toBeNull();
    expect(await dominantLogoColor(null)).toBeNull();
    expect(await dominantLogoColor("data:image/png;base64,bm90LWFuLWltYWdl")).toBeNull();
  });
});
