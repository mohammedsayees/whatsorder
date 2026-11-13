// Poster render pipeline tests (brief §6.2 / §9).
//
// The SVG produced by satori is deterministic for a given satori version +
// font files + props, and identical across platforms — so we snapshot its
// SHA-256 per template/variant: a satori bump (or accidental template edit)
// that changes any poster fails CI visibly. The PNG step (resvg-js, a native
// Rust build) can differ byte-wise between macOS and CI's Linux, so for the
// raster we assert structure instead: valid PNG, exact 1080×1920, under the
// WhatsApp 5 MB cap, and no more than ~25% of the canvas as undifferentiated
// flat colour.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";

import { buildPosterTree, posterSize, rasterizePosterSvg, renderPosterSvg } from "./render";
import type { PosterNode } from "./templates/node";
import { buildPalette } from "./palette";
import { POSTER_THEME_IDS, type PosterThemeId } from "./themes";
import {
  POSTER_HEIGHT,
  POSTER_MAX_BYTES,
  POSTER_WIDTH,
  type PosterLayoutId,
  type PosterProps,
  type PosterTemplateId
} from "./types";

let photoDataUri: string;
let logoDataUri: string;
let qrDataUri: string;
let cutoutDataUri: string;
let backgroundDataUri: string;

beforeAll(async () => {
  // Deterministic in-memory fixtures — no binary files in the repo. The photo
  // is textured (a real dish photo is never one flat colour).
  const photo = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><defs><radialGradient id="g"><stop offset="0" stop-color="#d9934e"/><stop offset="1" stop-color="#3a1d0c"/></radialGradient></defs><rect width="320" height="240" fill="url(#g)"/>${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i * 37) % 320}" cy="${(i * 53) % 240}" r="${6 + (i % 5) * 3}" fill="#${(0x904020 + i * 0x030201).toString(16)}"/>`).join("")}</svg>`
    )
  )
    .png()
    .toBuffer();
  photoDataUri = `data:image/png;base64,${photo.toString("base64")}`;
  const qr = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 28, g: 23, b: 20 } }
  })
    .png()
    .toBuffer();
  qrDataUri = `data:image/png;base64,${qr.toString("base64")}`;
  // A transparent "cut-out" (dish on alpha) and a textured background.
  const cutout = await sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><ellipse cx="200" cy="250" rx="170" ry="70" fill="#efe6d8"/><rect x="120" y="120" width="160" height="130" fill="#f6f1e8"/><ellipse cx="200" cy="122" rx="80" ry="24" fill="#a0592a"/></svg>`
    )
  )
    .png()
    .toBuffer();
  cutoutDataUri = `data:image/png;base64,${cutout.toString("base64")}`;
  backgroundDataUri = photoDataUri;

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
    layout?: PosterLayoutId;
    photo?: boolean;
    logo?: boolean;
    soldQty?: number | null;
    originalPriceLine?: string | null;
    savingLabel?: string | null;
    title?: string;
    headline?: string;
    restaurantName?: string;
    qr?: boolean;
    theme?: PosterThemeId;
    brand?: string | null;
    cutout?: boolean;
    background?: boolean;
  } = {}
): PosterProps {
  return {
    templateId,
    layout: overrides.layout ?? "photo_hero",
    branding: {
      restaurantName: overrides.restaurantName ?? "Chai Xpress",
      logoDataUri: overrides.logo === false ? null : logoDataUri,
      ...(overrides.theme ? { theme: overrides.theme } : {}),
      ...(overrides.brand !== undefined ? { palette: buildPalette(overrides.brand) } : {})
    },
    subject: {
      title: overrides.title ?? "Karak Chai",
      priceLine: "AED 12",
      originalPriceLine: overrides.originalPriceLine ?? null,
      savingLabel: overrides.savingLabel ?? null,
      photoDataUri: overrides.photo === false ? null : photoDataUri,
      cutoutDataUri: overrides.cutout ? cutoutDataUri : null,
      backgroundDataUri: overrides.background ? backgroundDataUri : null,
      soldQty: overrides.soldQty === undefined ? 87 : overrides.soldQty
    },
    cta: { qrDataUri: overrides.qr === false ? null : qrDataUri },
    copy: {
      headline: overrides.headline ?? "The cup Al Ain runs on",
      subline: "Strong, sweet and poured fresh all day.",
      caption:
        "Karak Chai is our bestseller for a reason. Order on WhatsApp and taste why."
    }
  };
}

// Every layout × photo-availability combination — each must be visually
// distinct and render inside the PNG contract.
const scenarios: { name: string; props: () => PosterProps }[] = [
  { name: "bestseller photo-hero circle", props: () => makeProps("bestseller") },
  {
    name: "bestseller photo-hero lettering (no photo, no logo)",
    props: () => makeProps("bestseller", { photo: false, logo: false })
  },
  {
    name: "bestseller full-bleed",
    props: () => makeProps("bestseller", { layout: "full_bleed" })
  },
  {
    name: "bestseller full-bleed bands (no photo)",
    props: () => makeProps("bestseller", { layout: "full_bleed", photo: false })
  },
  {
    name: "bestseller stat-led",
    props: () => makeProps("bestseller", { layout: "stat_led" })
  },
  {
    name: "bestseller stat-led rings (no photo)",
    props: () => makeProps("bestseller", { layout: "stat_led", photo: false })
  },
  {
    name: "bestseller stat-led cold start (no sold qty)",
    props: () => makeProps("bestseller", { layout: "stat_led", soldQty: null })
  },
  {
    name: "offer arch with saving stamp",
    props: () =>
      makeProps("offer", { originalPriceLine: "AED 16", savingLabel: "25% OFF" })
  },
  {
    name: "offer arch price fill (no photo)",
    props: () =>
      makeProps("offer", { photo: false, originalPriceLine: "AED 15", savingLabel: "SAVE AED 3" })
  },
  {
    name: "offer full-bleed",
    props: () =>
      makeProps("offer", { layout: "full_bleed", originalPriceLine: "AED 16", savingLabel: "25% OFF" })
  },
  {
    name: "offer full-bleed bands (no photo)",
    props: () =>
      makeProps("offer", {
        layout: "full_bleed",
        photo: false,
        originalPriceLine: "AED 15",
        savingLabel: "20% OFF"
      })
  },
  {
    name: "offer price-led",
    props: () =>
      makeProps("offer", { layout: "stat_led", originalPriceLine: "AED 16", savingLabel: "25% OFF" })
  },
  {
    name: "offer price-led rings (no photo, no saving, no QR)",
    props: () => makeProps("offer", { layout: "stat_led", photo: false, qr: false })
  },
  // Every theme × composition, alternating photo / no photo and brand colours.
  ...POSTER_THEME_IDS.flatMap((theme, themeIndex) =>
    (["photo_hero", "full_bleed", "stat_led"] as PosterLayoutId[]).flatMap((layout, layoutIndex) =>
      (["bestseller", "offer"] as const).map((templateId) => ({
        name: `theme ${theme} ${templateId} ${layout}`,
        props: () =>
          makeProps(templateId, {
            theme,
            layout,
            photo: (themeIndex + layoutIndex) % 2 === 0,
            brand: [null, "#1d4ed8", "#2f7d4f", "#db2777"][themeIndex],
            ...(templateId === "offer" ? { originalPriceLine: "AED 16", savingLabel: "25% OFF" } : {})
          })
      }))
    )
  ),
  // Phase 6: AI cut-out (bestseller hero, offer arch) and AI background.
  ...POSTER_THEME_IDS.flatMap((theme) => [
    {
      name: `cut-out ${theme} bestseller hero`,
      props: () => makeProps("bestseller", { theme, cutout: true })
    },
    {
      name: `cut-out ${theme} offer arch`,
      props: () => makeProps("offer", { theme, cutout: true, originalPriceLine: "AED 16", savingLabel: "25% OFF" })
    }
  ]),
  {
    name: "AI background full-bleed (no photo)",
    props: () => makeProps("bestseller", { layout: "full_bleed", photo: false, background: true })
  },
  // Phase 7: every template × format × composition.
  ...(["story", "portrait", "square"] as const).flatMap((format) =>
    (["photo_hero", "full_bleed", "stat_led"] as PosterLayoutId[]).flatMap((layout) => [
      { name: `${format} bestseller ${layout}`, props: () => ({ ...makeProps("bestseller", { layout }), format }) },
      {
        name: `${format} offer ${layout}`,
        props: () => ({ ...makeProps("offer", { layout, originalPriceLine: "AED 16", savingLabel: "25% OFF" }), format })
      },
      {
        name: `${format} new item ${layout}`,
        props: () => ({ ...makeProps("new_item", { layout, soldQty: null, photo: layout !== "full_bleed" }), format })
      },
      {
        name: `${format} loyalty ${layout}`,
        props: () => {
          const base = makeProps("loyalty", { layout, photo: false, soldQty: null });
          return { ...base, format, subject: { ...base.subject, priceLine: null, loyalty: { stamps: 8, reward: "a free karak" } } };
        }
      },
      {
        name: `${format} festival ${layout}`,
        props: () => {
          const base = makeProps("festival", { layout, photo: false, soldQty: null });
          return { ...base, format, subject: { ...base.subject, priceLine: null, festival: "eid_al_fitr" as const } };
        }
      }
    ])
  ),
  {
    name: "festival Arabic-led Diwali-free Eid with featured dish",
    props: () => {
      const base = makeProps("festival", { soldQty: null });
      return { ...base, language: "ar" as const, subject: { ...base.subject, festival: "eid_al_adha" as const } };
    }
  },
  {
    name: "bestseller with Arabic names",
    props: () =>
      makeProps("bestseller", {
        photo: false,
        title: "شاي كرك",
        headline: "Karak كرك الأصلي",
        restaurantName: "مقهى شاي إكسبريس"
      })
  }
];

/** Share of the canvas in 54px blocks with no visible variation. */
async function flatShare(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const block = 54;
  let flat = 0;
  let total = 0;
  for (let by = 0; by + block <= info.height; by += block) {
    for (let bx = 0; bx + block <= info.width; bx += block) {
      total += 1;
      let min = 765;
      let max = 0;
      for (let y = by; y < by + block; y += 2) {
        for (let x = bx; x < bx + block; x += 2) {
          const i = (y * info.width + x) * 3;
          const v = data[i] + data[i + 1] + data[i + 2];
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
      if (max - min < 18) flat += 1;
    }
  }
  return flat / total;
}

function textsOf(node: PosterNode | string): string[] {
  if (typeof node === "string") return [node];
  const children = node.props.children;
  if (children === undefined) return [];
  return (Array.isArray(children) ? children : [children]).flatMap(textsOf);
}

function stylesOf(node: PosterNode | string): Record<string, string | number>[] {
  if (typeof node === "string") return [];
  const children = node.props.children;
  const own = node.props.style ? [node.props.style] : [];
  if (children === undefined) return own;
  return [...own, ...(Array.isArray(children) ? children : [children]).flatMap(stylesOf)];
}

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
      const size = posterSize(scenario.props());
      expect(metadata.width).toBe(size.width);
      expect(metadata.height).toBe(size.height);
      expect(png.byteLength).toBeGreaterThan(10_000);
      expect(png.byteLength).toBeLessThanOrEqual(POSTER_MAX_BYTES);
      // Food posters, not app screens: no big empty fields.
      expect(await flatShare(png)).toBeLessThanOrEqual(0.25);

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
      makeProps("bestseller", { photo: false, logo: false, qr: false })
    );
    // No photo, logo or QR → no raster image may remain (code-drawn SVG
    // artwork — stamp, glyph, texture — is fine).
    expect(svg).not.toMatch(/data:image\/(png|jpeg)/);

    const withPhoto = await renderPosterSvg(makeProps("bestseller"));
    expect(withPhoto).toMatch(/data:image\/(png|jpeg)/);
  });

  describe("poster content rules", () => {
    const layouts: PosterLayoutId[] = ["photo_hero", "full_bleed", "stat_led"];

    it("shows the sold count and the café name exactly once, in every theme", () => {
      for (const theme of POSTER_THEME_IDS) {
        for (const layout of layouts) {
          for (const photo of [true, false]) {
            const texts = textsOf(buildPosterTree(makeProps("bestseller", { layout, photo, theme })));
            const where = `${theme} ${layout} photo=${photo}`;
            expect(texts.filter((value) => value.includes("87")), where).toHaveLength(1);
            expect(texts.filter((value) => value.includes("Chai Xpress")), where).toHaveLength(1);
          }
        }
      }
    });

    it("themes change type, not just colour", () => {
      const familiesOf = (theme: PosterThemeId) =>
        new Set(
          stylesOf(buildPosterTree(makeProps("bestseller", { theme })))
            .map((style) => String(style.fontFamily ?? ""))
            .filter(Boolean)
        );
      expect(familiesOf("street_food").has("Anton, Cairo")).toBe(true);
      expect(familiesOf("bold_deal").has("Anton, Cairo")).toBe(true);
      expect(familiesOf("dark_premium").has("DM Serif Display, Cairo")).toBe(true);
      expect(familiesOf("dark_premium").has("Anton, Cairo")).toBe(false);
      expect(familiesOf("minimal_cafe").has("Anton, Cairo")).toBe(false);
    });

    it("shows the offer's saving stamp once, and only when there is one", () => {
      for (const layout of layouts) {
        const withSaving = textsOf(
          buildPosterTree(makeProps("offer", { layout, originalPriceLine: "AED 16", savingLabel: "25% OFF" }))
        );
        expect(withSaving.filter((value) => value === "25%")).toHaveLength(1);
        const without = textsOf(buildPosterTree(makeProps("offer", { layout })));
        expect(without.some((value) => /%|you save/i.test(value))).toBe(false);
      }
    });

    it("sets short headlines at poster scale and never uses a monospace face", () => {
      const styles = stylesOf(
        buildPosterTree(makeProps("bestseller", { headline: "Karak o'clock" }))
      );
      const sizes = styles.map((style) => Number(style.fontSize ?? 0));
      expect(Math.max(...sizes)).toBeGreaterThanOrEqual(150);
      for (const layout of layouts) {
        for (const templateId of ["bestseller", "offer"] as const) {
          const fonts = stylesOf(buildPosterTree(makeProps(templateId, { layout })))
            .map((style) => String(style.fontFamily ?? ""))
            .join(" ");
          expect(fonts).not.toMatch(/mono/i);
        }
      }
    });

    it("always carries the WhatsApp call to action", () => {
      for (const layout of layouts) {
        for (const templateId of ["bestseller", "offer"] as const) {
          expect(textsOf(buildPosterTree(makeProps(templateId, { layout })))).toContain("Order on WhatsApp");
        }
      }
    });
  });

  it("uses the cut-out instead of the photo when one is cached", () => {
    const withCutout = JSON.stringify(buildPosterTree(makeProps("bestseller", { cutout: true })));
    expect(withCutout).toContain(cutoutDataUri);
    expect(withCutout).not.toContain(photoDataUri);
    const offer = JSON.stringify(buildPosterTree(makeProps("offer", { cutout: true })));
    expect(offer).toContain(cutoutDataUri);
    // No photo → a cached cut-out (of an old photo) is never shown.
    const noPhoto = JSON.stringify(buildPosterTree(makeProps("bestseller", { cutout: true, photo: false })));
    expect(noPhoto).not.toContain(cutoutDataUri);
  });

  describe("Phase 7 content rules", () => {
    it("loyalty shows the restaurant's real stamp count and reward", () => {
      const base = makeProps("loyalty", { photo: false, soldQty: null });
      for (const layout of ["photo_hero", "full_bleed", "stat_led"] as PosterLayoutId[]) {
        const texts = textsOf(
          buildPosterTree({ ...base, layout, subject: { ...base.subject, priceLine: null, loyalty: { stamps: 7, reward: "a free karak" } } })
        ).join(" | ");
        expect(texts, layout).toMatch(/7/);
        expect(texts, layout).toMatch(/a free karak/);
        expect(texts, layout).not.toMatch(/\b10\b/);
      }
    });

    it("festival greetings are code-owned, Arabic-led on Arabic posters", () => {
      const base = makeProps("festival", { photo: false, soldQty: null });
      const subject = { ...base.subject, priceLine: null, festival: "eid_al_fitr" as const };
      const english = textsOf(buildPosterTree({ ...base, subject }));
      expect(english).toContain("Eid Mubarak");
      const arabic = JSON.stringify(buildPosterTree({ ...base, subject, language: "ar" }));
      // The Arabic greeting comes first in the tree when the poster is Arabic.
      expect(arabic.indexOf("مبارك")).toBeLessThan(arabic.indexOf("Eid Mubarak"));
    });

    it("never draws a rupee sign the fonts can't render", () => {
      const base = makeProps("bestseller");
      const texts = textsOf(
        buildPosterTree({ ...base, subject: { ...base.subject, priceLine: "₹120" }, copy: { ...base.copy, headline: "Only ₹120 today" } })
      ).join(" ");
      expect(texts).not.toContain("₹");
      expect(texts).toContain("Rs 120");
    });
  });
});

