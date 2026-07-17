// Poster render pipeline tests (brief §6.2 / §9).
//
// The SVG produced by satori is deterministic for a given satori version +
// font files + props, and identical across platforms — so we snapshot its
// SHA-256 per template/variant: a satori bump (or accidental template edit)
// that changes any poster fails CI visibly. The PNG step (resvg-js, a native
// Rust build) can differ byte-wise between macOS and CI's Linux, so for the
// raster we assert structure instead: valid PNG, exact 1080×1920, under the
// WhatsApp 5 MB cap.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import { rasterizePosterSvg, renderPosterSvg } from "./render";
import {
  POSTER_HEIGHT,
  POSTER_MAX_BYTES,
  POSTER_WIDTH,
  type PosterProps,
  type PosterTemplateId
} from "./types";

let photoDataUri: string;
let logoDataUri: string;

beforeAll(async () => {
  // Deterministic in-memory fixtures — no binary files in the repo.
  const photo = await sharp({
    create: {
      width: 64,
      height: 48,
      channels: 3,
      background: { r: 180, g: 120, b: 60 }
    }
  })
    .png()
    .toBuffer();
  photoDataUri = `data:image/png;base64,${photo.toString("base64")}`;

  const logo = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 31, g: 138, b: 91 }
    }
  })
    .png()
    .toBuffer();
  logoDataUri = `data:image/png;base64,${logo.toString("base64")}`;
});

function makeProps(
  templateId: PosterTemplateId,
  overrides: {
    photo?: boolean;
    logo?: boolean;
    soldQty?: number | null;
    originalPriceLine?: string | null;
  } = {}
): PosterProps {
  return {
    templateId,
    branding: {
      restaurantName: "Chai Xpress",
      logoDataUri: overrides.logo === false ? null : logoDataUri
    },
    subject: {
      title: "Karak Chai",
      priceLine: "AED 12",
      originalPriceLine: overrides.originalPriceLine ?? null,
      photoDataUri: overrides.photo === false ? null : photoDataUri,
      soldQty: overrides.soldQty ?? 87
    },
    copy: {
      headline: "The cup Al Ain runs on",
      subline: "87 cups poured this month — see what the fuss is about.",
      caption:
        "Karak Chai is our bestseller for a reason. Order on WhatsApp and taste why."
    }
  };
}

const scenarios: { name: string; props: () => PosterProps }[] = [
  { name: "bestseller photo", props: () => makeProps("bestseller") },
  {
    name: "bestseller typographic (no photo, no logo)",
    props: () => makeProps("bestseller", { photo: false, logo: false })
  },
  {
    name: "offer photo with struck price",
    props: () => makeProps("offer", { originalPriceLine: "AED 15" })
  },
  {
    name: "offer typographic",
    props: () =>
      makeProps("offer", { photo: false, originalPriceLine: "AED 15" })
  }
];

describe("poster render pipeline", () => {
  for (const scenario of scenarios) {
    it(`renders ${scenario.name} deterministically and inside the PNG contract`, async () => {
      const svg = await renderPosterSvg(scenario.props());

      expect(svg.startsWith("<svg")).toBe(true);
      const hash = createHash("sha256").update(svg).digest("hex");
      expect(hash).toMatchSnapshot();

      const png = rasterizePosterSvg(svg);
      const metadata = await sharp(png).metadata();
      expect(metadata.format).toBe("png");
      expect(metadata.width).toBe(POSTER_WIDTH);
      expect(metadata.height).toBe(POSTER_HEIGHT);
      expect(png.byteLength).toBeGreaterThan(10_000);
      expect(png.byteLength).toBeLessThanOrEqual(POSTER_MAX_BYTES);

      // Drop inspectable renders next to vitest output for manual review.
      if (process.env.POSTER_TEST_ARTIFACTS) {
        const dir = process.env.POSTER_TEST_ARTIFACTS;
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          path.join(dir, `${scenario.name.replace(/[^a-z0-9]+/gi, "-")}.png`),
          png
        );
      }
    });
  }

  it("missing assets produce the typographic variant — no empty image windows", async () => {
    const svg = await renderPosterSvg(
      makeProps("bestseller", { photo: false, logo: false })
    );
    // No photo AND no logo → nothing image-shaped may remain in the output.
    expect(svg).not.toContain("data:image");

    const withPhoto = await renderPosterSvg(makeProps("bestseller"));
    expect(withPhoto).toContain("data:image");
  });
});
