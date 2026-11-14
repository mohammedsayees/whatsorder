import { describe, expect, it } from "vitest";

import { posterScheme, type PosterField } from "./design";
import {
  DEFAULT_PALETTE,
  MIN_TEXT_CONTRAST,
  buildPalette,
  contrastRatio,
  hexToHsl,
  hslToHex,
  normalizeHex
} from "./palette";
import { POSTER_THEME_IDS, themesForGeneration } from "./themes";

describe("colour maths", () => {
  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("normalises hex input", () => {
    expect(normalizeHex("#1D4ED8")).toBe("#1d4ed8");
    expect(normalizeHex("1d4ed8")).toBe("#1d4ed8");
    expect(normalizeHex("#fff")).toBeNull();
    expect(normalizeHex("red")).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });

  it("round-trips HSL", () => {
    expect(hslToHex(hexToHsl("#e0412f"))).toBe("#e0412f");
  });
});

// A sweep of brand colours: every 15° of hue at several lightness and
// saturation levels, plus the awkward extremes.
const BRANDS: (string | null)[] = [
  null,
  "#000000",
  "#ffffff",
  "#808080",
  "#ffff00",
  "#00ff00",
  "#00ffff",
  "#facc15",
  ...Array.from({ length: 24 }, (_, i) => i * 15).flatMap((h) =>
    [0.25, 0.45, 0.6, 0.8].flatMap((l) => [0.35, 0.9].map((s) => hslToHex({ h, s, l })))
  )
];
const FIELDS: PosterField[] = ["hero", "bleed", "stat", "arch", "price"];

describe("poster palettes", () => {
  it("default palette keeps the food colours (adjusted only for contrast)", () => {
    const palette = buildPalette(null);
    expect(palette.dark).toBe(DEFAULT_PALETTE.dark);
    expect(palette.light).toBe(DEFAULT_PALETTE.light);
    expect(palette.secondary).toBe(DEFAULT_PALETTE.secondary);
    expect(hexToHsl(palette.primary).h).toBeCloseTo(hexToHsl(DEFAULT_PALETTE.primary).h, 0);
  });

  it("every text colour meets 4.5:1 on its background, for every brand, theme and composition", () => {
    const failures: string[] = [];
    for (const brand of BRANDS) {
      const palette = buildPalette(brand);
      for (const theme of POSTER_THEME_IDS) {
        for (const field of FIELDS) {
          const s = posterScheme({ restaurantName: "x", logoDataUri: null, palette, theme }, field);
          const pairs: [string, string, string][] = [
            ["text/bg", s.text, s.bg],
            ["accent/bg", s.accent, s.bg],
            ["stampText/stampFill", s.stampText, s.stampFill],
            ["onDecoA/decoA", s.onDecoA, s.decoA],
            ["accentOnDecoA/decoA", s.accentOnDecoA, s.decoA],
            ["onBase/base", s.onBase, s.base],
            ["accentOnBase/base", s.accentOnBase, s.base]
          ];
          for (const [name, fg, bg] of pairs) {
            const ratio = contrastRatio(fg, bg);
            if (ratio < MIN_TEXT_CONTRAST) {
              failures.push(`${brand} ${theme} ${field} ${name} ${fg} on ${bg} = ${ratio.toFixed(2)}`);
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("keeps the brand hue as the primary colour", () => {
    const palette = buildPalette("#1d4ed8");
    expect(Math.abs(hexToHsl(palette.primary).h - hexToHsl("#1d4ed8").h)).toBeLessThan(3);
  });

  it("never pairs a yellow/orange brand with a lime highlight", () => {
    for (const brand of ["#facc15", "#f59e0b", "#ea580c"]) {
      const h = hexToHsl(buildPalette(brand).secondary).h;
      expect(h < 30 || h > 330, `${brand} → hue ${h}`).toBe(true);
    }
  });
});

describe("themesForGeneration", () => {
  it("uses the default theme for every variant, or one theme per variant", () => {
    expect(themesForGeneration("dark_premium", "default", 3)).toEqual([
      "dark_premium",
      "dark_premium",
      "dark_premium"
    ]);
    const mixed = themesForGeneration("dark_premium", "mix", 3);
    expect(mixed[0]).toBe("dark_premium");
    expect(new Set(mixed).size).toBe(3);
  });
});
