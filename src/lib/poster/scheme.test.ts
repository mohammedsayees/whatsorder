import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { posterScheme } from "./design";
import { buildPalette } from "./palette";
import { schemeFor } from "./scheme";
import { POSTER_THEMES, POSTER_THEME_IDS } from "./themes";

describe("schemeFor", () => {
  it("matches the renderer's posterScheme for every theme", () => {
    const palette = buildPalette("#c77a4c");
    for (const id of POSTER_THEME_IDS) {
      expect(schemeFor(palette, POSTER_THEMES[id], "hero")).toEqual(
        posterScheme({ restaurantName: "x", logoDataUri: null, palette, theme: id }, "hero")
      );
    }
  });

  it("stays browser-safe: the Brand look preview imports it in a client component", () => {
    for (const file of ["scheme.ts", "palette.ts", "themes.ts"]) {
      const source = readFileSync(path.join(__dirname, file), "utf8");
      const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
      expect(imports.every((spec) => spec.startsWith("./")), `${file}: ${imports.join(", ")}`).toBe(true);
    }
  });
});
