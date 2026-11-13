import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPosterFonts, type PosterFont } from "@/lib/poster/fonts";

const arabicFontFiles = [
  {
    path: "cairo-arabic-400-normal.woff",
    weight: 400 as const
  },
  {
    path: "cairo-arabic-700-normal.woff",
    weight: 700 as const
  }
];

let menuFontsPromise: Promise<PosterFont[]> | null = null;

export function getMenuPdfFonts(): Promise<PosterFont[]> {
  if (!menuFontsPromise) {
    menuFontsPromise = Promise.all([
      getPosterFonts(),
      ...arabicFontFiles.map(async (font) => {
        const buffer = await readFile(
          join(process.cwd(), "node_modules", "@fontsource", "cairo", "files", font.path)
        );
        return [{
          name: "Cairo",
          data: buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength
          ) as ArrayBuffer,
          weight: font.weight,
          style: "normal" as const
        }];
      })
    ]).then((fontGroups) => fontGroups.flat());
    menuFontsPromise.catch(() => {
      menuFontsPromise = null;
    });
  }
  return menuFontsPromise;
}
