// lib/poster/fonts.ts
//
// Poster fonts, loaded once per serverless instance. The .woff files (Satori
// reads ttf/otf/woff, not woff2) are committed under assets/fonts/ and traced
// into the deploy bundle via outputFileTracingIncludes in next.config.ts.
// Latin subsets keep the cold-start read small (~70 KB total).

import { readFile } from "node:fs/promises";
import path from "node:path";

export type PosterFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 700;
  style: "normal";
};

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

const FONT_FILES: { file: string; name: string; weight: 400 | 700 }[] = [
  {
    file: "bricolage-grotesque-latin-400-normal.woff",
    name: "Bricolage Grotesque",
    weight: 400
  },
  {
    file: "bricolage-grotesque-latin-700-normal.woff",
    name: "Bricolage Grotesque",
    weight: 700
  },
  { file: "geist-mono-latin-400-normal.woff", name: "Geist Mono", weight: 400 }
];

let fontsPromise: Promise<PosterFont[]> | null = null;

export function getPosterFonts(): Promise<PosterFont[]> {
  if (!fontsPromise) {
    fontsPromise = Promise.all(
      FONT_FILES.map(async ({ file, name, weight }) => {
        const buffer = await readFile(path.join(FONT_DIR, file));
        return {
          name,
          data: buffer.buffer.slice(
            buffer.byteOffset,
            buffer.byteOffset + buffer.byteLength
          ) as ArrayBuffer,
          weight,
          style: "normal" as const
        };
      })
    );
    // A failed read must not poison every later render on this instance.
    fontsPromise.catch(() => {
      fontsPromise = null;
    });
  }
  return fontsPromise;
}
