// lib/poster/templates/offer.ts
//
// Offer / promo template — highest order intent. Price text is rendered
// verbatim from the offers table (formatted server-side) and the saving stamp
// is computed in code from the real regular and promotional prices
// (offer-math.ts); the AI contributes headline/subline only.
//
//   photo_hero — the AI cut-out bursting out of a colour-filled arch, else
//                the photo in an arch; rotated saving stamp, giant price
//                below (no photo: the arch itself holds the giant price)
//   full_bleed — dish fills the top, short soft fade, price on the base colour
//                (no photo: the AI background when cached, else diagonal
//                bands with the item name as texture)
//   stat_led   — the price is the hero, dish in a circle
//                (no photo: concentric rings)
//
// Colours from the restaurant palette via posterScheme; type, stamp shape and
// decoration from the active theme.

import {
  ABOVE_CTA,
  CONTENT_WIDTH,
  PAD,
  arch,
  balancedWidth,
  band,
  bandLettering,
  bodyText,
  brandBlock,
  canvas,
  ctaBlock,
  cutoutOnBackdrop,
  disc,
  displayText,
  fitFont,
  fullBleedPhoto,
  layer,
  photoCircle,
  posterScheme,
  priceRow,
  rgbList,
  rings,
  stamp,
  texture
} from "../design";
import type { PosterProps } from "../types";
import type { PosterNode } from "./node";

export function offerTemplate(props: PosterProps): PosterNode {
  const photo = props.subject.photoDataUri;
  switch (props.layout) {
    case "full_bleed":
      return fullBleed(props, photo);
    case "stat_led":
      return priceLed(props, photo);
    default:
      return archHero(props, photo);
  }
}

function savingStamp(
  props: PosterProps,
  options: { size: number; fill: string; color: string; rotate: number; position: Record<string, number> }
): PosterNode | null {
  const label = props.subject.savingLabel;
  if (!label) return null;
  // "25% OFF" → big "25%" + small "OFF"; "SAVE AED 4" → small "SAVE" + big "AED 4".
  const percent = label.match(/^(\d+%)\s+OFF$/i);
  const save = label.match(/^SAVE\s+(.+)$/i);
  const lines = percent
    ? { big: percent[1], small: "off" }
    : save
      ? { big: save[1], small: "you save" }
      : { big: label };
  return stamp(lines, options);
}

function priceSize(price: string | null, width: number, max: number): number {
  return price ? fitFont(price, { width, maxLines: 1, max, min: 120 }) : 0;
}

// ── photo_hero (arch) ───────────────────────────────────────────────────────

function archHero(props: PosterProps, photo: string | null): PosterNode {
  const s = posterScheme(props.branding, "arch");
  const { priceLine, originalPriceLine } = props.subject;
  const headlineSize = fitFont(props.copy.headline, {
    width: CONTENT_WIDTH,
    maxLines: photo ? 2 : 3,
    max: photo ? 128 : 170,
    min: 88
  });
  const archWidth = 840;
  const archHeight = 860;

  const cutout = photo ? props.subject.cutoutDataUri ?? null : null;
  const archNode = cutout
    ? arch(archWidth, archHeight, { top: 180, left: 120 }, { fill: s.decoA, children: [] })
    : photo
    ? arch(archWidth, archHeight, { top: 180, left: 120 }, { photo })
    : arch(archWidth, archHeight, { top: 180, left: 120 }, {
        fill: s.decoA,
        children: [
          bodyText(props.subject.title, 48, s.onDecoA, { maxWidth: archWidth - 160, marginTop: 200 }, {
            textAlign: "center",
            lineClamp: 2
          }),
          priceLine
            ? displayText(priceLine, priceSize(priceLine, archWidth - 120, 300), s.onDecoA, { marginTop: 18 }, { lineHeight: 0.9 })
            : null,
          originalPriceLine
            ? bodyText(originalPriceLine, 54, s.accentOnDecoA, { marginTop: 12 }, { textDecoration: "line-through" })
            : null
        ]
      });

  return canvas(
    s.bg,
    [
      texture(s.text, 0.12),
      disc(560, s.decoB, { top: 60, right: -190 }),
      disc(240, s.decoA, { top: 800, left: -120 }),
      archNode,
      ...(cutout
        ? cutoutOnBackdrop(cutout, { top: 270, left: 150, size: 780, backdrop: s.decoA, scale: 1.1, disc: false })
        : []),
      savingStamp(props, {
        size: 330,
        fill: s.stampFill,
        color: s.stampText,
        rotate: 12,
        position: { top: 150, right: 40 }
      }),
      layer({ top: PAD, left: PAD }, [brandBlock(props.branding, s.text, { ring: s.ring })]),
      layer({ bottom: ABOVE_CTA, left: PAD, width: CONTENT_WIDTH }, [
        displayText(props.copy.headline, headlineSize, s.text, {
          maxWidth: balancedWidth(props.copy.headline, headlineSize, CONTENT_WIDTH)
        }),
        photo
          ? priceRow(priceLine, originalPriceLine, {
              size: priceSize(priceLine, CONTENT_WIDTH - 300, 210),
              color: s.accent,
              strikeColor: s.text,
              layout: { marginTop: 22 }
            })
          : bodyText(props.copy.subline, 40, s.text, { marginTop: 24 }, { lineClamp: 2 }),
        photo
          ? bodyText(props.subject.title, 44, s.text, { marginTop: 14 }, { lineClamp: 1 })
          : null
      ]),
      layer({ bottom: PAD, left: PAD }, [ctaBlock(props.cta, { text: s.text, muted: s.accent })])
    ],
    s.accent
  );
}

// ── full_bleed ──────────────────────────────────────────────────────────────

function fullBleed(props: PosterProps, photo: string | null): PosterNode {
  const s = posterScheme(props.branding, "bleed");
  // A photo-less item uses its cached AI background in the photo's place.
  const tall = props.subject.photoTallDataUri ?? photo ?? props.subject.backgroundDataUri ?? null;
  const { priceLine, originalPriceLine } = props.subject;
  const headlineSize = fitFont(props.copy.headline, {
    width: CONTENT_WIDTH,
    maxLines: tall ? 1 : 2,
    max: tall ? 100 : 140,
    min: 64
  });
  const text = tall ? s.onBase : s.text;
  const accent = tall ? s.accentOnBase : s.accent;
  const decoration: (PosterNode | null)[] = tall
    ? fullBleedPhoto(tall, s)
    : [
        texture(s.text, 0.08),
        band(s.decoB, { top: 230, height: 420, rotate: 10 }, [
          bandLettering(props.subject.title, 290, { fill: s.decoA, stroke: s.decoA })
        ]),
        band(s.decoA, { top: 700, height: 70, rotate: 10 }),
        band(s.ring, { top: 800, height: 22, rotate: 10 })
      ];
  return canvas(
    tall ? s.base : s.bg,
    [
      ...decoration,
      savingStamp(props, {
        size: 340,
        fill: s.stampFill,
        color: s.stampText,
        rotate: -10,
        position: tall ? { top: 860, right: 48 } : { top: 640, right: 70 }
      }),
      layer({ top: PAD, left: PAD }, [
        brandBlock(
          props.branding,
          text,
          tall ? { ring: s.palette.light, plate: `rgba(${rgbList(s.base)},0.78)` } : { ring: s.ring }
        )
      ]),
      // Price is the hero; type starts where the fade is near-solid.
      layer({ bottom: ABOVE_CTA, left: PAD, width: CONTENT_WIDTH }, [
        priceRow(priceLine, originalPriceLine, {
          size: priceSize(priceLine, CONTENT_WIDTH - 300, 190),
          color: accent,
          strikeColor: text
        }),
        bodyText(props.subject.title, 40, text, { marginTop: 10 }, { lineClamp: 1 }),
        displayText(props.copy.headline, headlineSize, text, {
          marginTop: 18,
          maxWidth: balancedWidth(props.copy.headline, headlineSize, CONTENT_WIDTH)
        })
      ]),
      layer({ bottom: PAD, left: PAD }, [ctaBlock(props.cta, { text, muted: accent })])
    ],
    accent
  );
}

// ── stat_led (price hero) ───────────────────────────────────────────────────

function priceLed(props: PosterProps, photo: string | null): PosterNode {
  const s = posterScheme(props.branding, "price");
  const { priceLine, originalPriceLine } = props.subject;
  const lowerWidth = 560;
  const ledHeadlineSize = fitFont(props.copy.headline, { width: lowerWidth, maxLines: 3, max: 104, min: 72 });
  const titleWidth = props.subject.savingLabel ? CONTENT_WIDTH - 300 : CONTENT_WIDTH;
  return canvas(
    s.bg,
    [
      texture(s.text, 0.1),
      photo
        ? photoCircle(photo, 620, s.decoA, { top: 1010, right: -210 }, 20)
        : rings(680, [s.decoA, s.decoB, s.decoA, s.bg], { top: 980, right: -250 }, 0.18),
      savingStamp(props, {
        size: 320,
        fill: s.stampFill,
        color: s.stampText,
        rotate: 14,
        position: { top: 250, right: 50 }
      }),
      layer({ top: PAD, left: PAD }, [brandBlock(props.branding, s.text, { ring: s.ring })]),
      layer({ top: 250, left: PAD, width: CONTENT_WIDTH }, [
        displayText(
          props.subject.title,
          fitFont(props.subject.title, { width: titleWidth, maxLines: 3, max: 120, min: 76 }),
          s.text,
          { maxWidth: titleWidth }
        ),
        priceLine
          ? displayText(priceLine, priceSize(priceLine, CONTENT_WIDTH, 360), s.accent, { marginTop: 24 }, { lineHeight: 0.86 })
          : null,
        originalPriceLine
          ? bodyText(`Was ${originalPriceLine}`, 52, s.text, { marginTop: 18 }, { textDecoration: "line-through" })
          : null
      ]),
      layer({ bottom: ABOVE_CTA, left: PAD, width: lowerWidth }, [
        displayText(props.copy.headline, ledHeadlineSize, s.text, {
          maxWidth: balancedWidth(props.copy.headline, ledHeadlineSize, lowerWidth)
        }),
        bodyText(props.copy.subline, 36, s.accent, { marginTop: 20 }, { lineClamp: 2 })
      ]),
      layer({ bottom: PAD, left: PAD }, [ctaBlock(props.cta, { text: s.text, muted: s.accent })])
    ],
    s.accent
  );
}
