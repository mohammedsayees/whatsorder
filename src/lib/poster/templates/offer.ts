// lib/poster/templates/offer.ts
//
// Offer / promo template — highest order intent. Price text is rendered
// verbatim from the offers table (formatted server-side) and the saving stamp
// is computed in code from the real regular and promotional prices
// (offer-math.ts); the AI contributes headline/subline only.
//
//   photo_hero — dish in an arch, rotated saving stamp, giant price below
//                (no photo: the arch itself holds the giant price)
//   full_bleed — dish fills the top, short soft fade, price on charcoal
//                (no photo: diagonal bands with the item name as texture)
//   stat_led   — the price is the hero on charcoal, dish in a circle
//                (no photo: concentric rings)

import {
  ABOVE_CTA,
  CONTENT_WIDTH,
  PAD,
  balancedWidth,
  PALETTE,
  arch,
  band,
  bodyText,
  brandBlock,
  canvas,
  ctaBlock,
  disc,
  displayText,
  dotTexture,
  fitFont,
  fullBleedPhoto,
  layer,
  photoCircle,
  priceRow,
  rings,
  stamp
} from "../design";
import type { PosterProps } from "../types";
import { box, type PosterNode } from "./node";

const { charcoal, cream, tomato, chili, mustard } = PALETTE;

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
  const { priceLine, originalPriceLine } = props.subject;
  const headlineSize = fitFont(props.copy.headline, {
    width: CONTENT_WIDTH,
    maxLines: photo ? 2 : 3,
    max: photo ? 128 : 170,
    min: 88
  });
  const archWidth = 840;
  const archHeight = 860;

  const archNode = photo
    ? arch(archWidth, archHeight, { top: 180, left: 120 }, { photo })
    : arch(archWidth, archHeight, { top: 180, left: 120 }, {
        fill: tomato,
        children: [
          bodyText(props.subject.title, 48, cream, { maxWidth: archWidth - 160, marginTop: 200 }, {
            textAlign: "center",
            lineClamp: 2
          }),
          priceLine
            ? displayText(priceLine, priceSize(priceLine, archWidth - 120, 300), cream, { marginTop: 18 }, { lineHeight: 0.9 })
            : null,
          originalPriceLine
            ? bodyText(originalPriceLine, 54, mustard, { marginTop: 12 }, { textDecoration: "line-through" })
            : null
        ]
      });

  return canvas(cream, [
    dotTexture(tomato, 0.12),
    disc(560, mustard, { top: 60, right: -190 }),
    disc(240, tomato, { top: 800, left: -120 }),
    archNode,
    savingStamp(props, {
      size: 330,
      fill: photo ? mustard : charcoal,
      color: photo ? charcoal : mustard,
      rotate: 12,
      position: { top: 150, right: 40 }
    }),
    layer({ top: PAD, left: PAD }, [brandBlock(props.branding, charcoal, { ring: charcoal })]),
    layer({ bottom: ABOVE_CTA, left: PAD, width: CONTENT_WIDTH }, [
      displayText(props.copy.headline, headlineSize, charcoal, {
        maxWidth: balancedWidth(props.copy.headline, headlineSize, CONTENT_WIDTH)
      }),
      photo
        ? priceRow(priceLine, originalPriceLine, {
            size: priceSize(priceLine, CONTENT_WIDTH - 300, 210),
            color: tomato,
            strikeColor: chili,
            layout: { marginTop: 22 }
          })
        : bodyText(props.copy.subline, 40, charcoal, { marginTop: 24 }, { opacity: 0.85, lineClamp: 2 }),
      photo
        ? bodyText(props.subject.title, 44, charcoal, { marginTop: 14 }, { lineClamp: 1 })
        : null
    ]),
    layer({ bottom: PAD, left: PAD }, [ctaBlock(props.cta, { text: charcoal, muted: chili })])
  ]);
}

// ── full_bleed ──────────────────────────────────────────────────────────────

function fullBleed(props: PosterProps, photo: string | null): PosterNode {
  const tall = props.subject.photoTallDataUri ?? photo;
  const { priceLine, originalPriceLine } = props.subject;
  const headlineSize = fitFont(props.copy.headline, {
    width: CONTENT_WIDTH,
    maxLines: tall ? 1 : 2,
    max: tall ? 100 : 140,
    min: 64
  });
  const decoration: (PosterNode | null)[] = tall
    ? fullBleedPhoto(tall)
    : [
        dotTexture(cream, 0.08),
        band(mustard, { top: 230, height: 420, rotate: 10 }, [
          displayText(props.subject.title, 290, chili, {}, { whiteSpace: "nowrap", lineHeight: 0.9 })
        ]),
        band(tomato, { top: 700, height: 70, rotate: 10 }),
        band(cream, { top: 800, height: 22, rotate: 10 })
      ];
  return canvas(charcoal, [
    ...decoration,
    savingStamp(props, {
      size: 340,
      fill: tomato,
      color: cream,
      rotate: -10,
      position: tall ? { top: 860, right: 48 } : { top: 640, right: 70 }
    }),
    layer({ top: PAD, left: PAD }, [
      brandBlock(props.branding, cream, tall ? { ring: cream, plate: "rgba(28,23,20,0.78)" } : { ring: cream })
    ]),
    // Price is the hero; type starts where the fade is near-solid.
    layer({ bottom: ABOVE_CTA, left: PAD, width: CONTENT_WIDTH }, [
      priceRow(priceLine, originalPriceLine, {
        size: priceSize(priceLine, CONTENT_WIDTH - 300, 190),
        color: mustard,
        strikeColor: cream
      }),
      bodyText(props.subject.title, 40, cream, { marginTop: 10 }, { opacity: 0.85, lineClamp: 1 }),
      displayText(props.copy.headline, headlineSize, cream, {
        marginTop: 18,
        maxWidth: balancedWidth(props.copy.headline, headlineSize, CONTENT_WIDTH)
      })
    ]),
    layer({ bottom: PAD, left: PAD }, [ctaBlock(props.cta, { text: cream, muted: mustard })])
  ]);
}

// ── stat_led (price hero) ───────────────────────────────────────────────────

function priceLed(props: PosterProps, photo: string | null): PosterNode {
  const { priceLine, originalPriceLine } = props.subject;
  const lowerWidth = 560;
  const ledHeadlineSize = fitFont(props.copy.headline, { width: lowerWidth, maxLines: 3, max: 104, min: 72 });
  const titleWidth = props.subject.savingLabel ? CONTENT_WIDTH - 300 : CONTENT_WIDTH;
  return canvas(charcoal, [
    dotTexture(mustard, 0.1),
    photo
      ? photoCircle(photo, 620, tomato, { top: 1010, right: -210 }, 20)
      : rings(680, [tomato, chili, tomato, charcoal], { top: 980, right: -250 }, 0.18),
    savingStamp(props, {
      size: 320,
      fill: tomato,
      color: cream,
      rotate: 14,
      position: { top: 250, right: 50 }
    }),
    layer({ top: PAD, left: PAD }, [brandBlock(props.branding, cream, { ring: cream })]),
    layer({ top: 250, left: PAD, width: CONTENT_WIDTH }, [
      displayText(
        props.subject.title,
        fitFont(props.subject.title, { width: titleWidth, maxLines: 3, max: 120, min: 76 }),
        cream,
        { maxWidth: titleWidth }
      ),
      priceLine
        ? displayText(priceLine, priceSize(priceLine, CONTENT_WIDTH, 360), mustard, { marginTop: 24 }, { lineHeight: 0.86 })
        : null,
      originalPriceLine
        ? bodyText(`Was ${originalPriceLine}`, 52, cream, { marginTop: 18 }, { textDecoration: "line-through", opacity: 0.8 })
        : null
    ]),
    layer({ bottom: ABOVE_CTA, left: PAD, width: lowerWidth }, [
      displayText(props.copy.headline, ledHeadlineSize, cream, {
        maxWidth: balancedWidth(props.copy.headline, ledHeadlineSize, lowerWidth)
      }),
      bodyText(props.copy.subline, 36, mustard, { marginTop: 20 }, { lineClamp: 2 })
    ]),
    layer({ bottom: PAD, left: PAD }, [ctaBlock(props.cta, { text: cream, muted: mustard })])
  ]);
}
