// lib/poster/templates/bestseller.ts
//
// Bestseller / social-proof template. With get_bestsellers' cold-start
// fallback it always has something to say. Three compositions (one per
// generated variant, see layoutForVariant), each with a photo-less form:
//
//   photo_hero — dish in a big ringed circle bleeding off the edge, a rotated
//                sold-count starburst overlapping it (no photo: the item name
//                as oversized cropped lettering)
//   full_bleed — the dish fills the top of the frame, a short soft fade into
//                charcoal carries the type (no photo: diagonal bands)
//   stat_led   — the sold count is the hero (no sales yet: the headline is),
//                photo in a circle at the edge (no photo: concentric rings)
//
// The sold count appears exactly once per poster; the café name exactly once
// (brand block). Prices come pre-formatted from tenant data.

import {
  ABOVE_CTA,
  CONTENT_WIDTH,
  PAD,
  balancedWidth,
  PALETTE,
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
  giantLettering,
  layer,
  photoCircle,
  rings,
  stamp
} from "../design";
import type { PosterProps } from "../types";
import { box, type PosterNode } from "./node";

const { charcoal, cream, tomato, chili, mustard } = PALETTE;

export function bestsellerTemplate(props: PosterProps): PosterNode {
  const photo = props.subject.photoDataUri;
  switch (props.layout) {
    case "full_bleed":
      return fullBleed(props, photo);
    case "stat_led":
      return statLed(props, photo);
    default:
      return photoHero(props, photo);
  }
}

function soldStamp(props: PosterProps): { big: string; small?: string } {
  const sold = props.subject.soldQty;
  return sold && sold > 0
    ? { big: `${sold}+`, small: "sold this month" }
    : { big: "Must try" };
}

/** Item name with its price, side by side. */
function itemLine(
  props: PosterProps,
  colors: { name: string; price: string },
  width = CONTENT_WIDTH,
  priceSize = 112
): PosterNode {
  const price = props.subject.priceLine;
  return box(
    { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", width },
    [
      bodyText(props.subject.title, 46, colors.name, { maxWidth: price ? width - 320 : width }, { lineClamp: 2 }),
      price ? displayText(price, priceSize, colors.price, { marginLeft: 24, flexShrink: 0 }, { lineHeight: 0.9 }) : null
    ]
  );
}

// ── photo_hero ──────────────────────────────────────────────────────────────

function photoHero(props: PosterProps, photo: string | null): PosterNode {
  const headlineSize = fitFont(props.copy.headline, {
    width: CONTENT_WIDTH,
    maxLines: 2,
    max: 160,
    min: 100
  });
  return canvas(mustard, [
    dotTexture(chili, 0.14),
    disc(1180, tomato, { top: -420, right: -520 }),
    photo
      ? photoCircle(photo, 860, cream, { top: 120, right: -120 })
      : giantLettering(props.subject.title, {
          size: 460,
          color: tomato,
          rotate: -8,
          position: { top: 130, left: -40 }
        }),
    photo
      ? null
      : giantLettering(props.subject.title, {
          size: 460,
          color: chili,
          rotate: -8,
          position: { top: 520, left: -330 }
        }),
    stamp(soldStamp(props), {
      size: 340,
      fill: photo ? tomato : charcoal,
      color: photo ? cream : mustard,
      rotate: -12,
      position: photo ? { top: 690, left: 40 } : { top: 250, right: 70 }
    }),
    layer({ top: PAD, left: PAD }, [brandBlock(props.branding, charcoal)]),
    layer({ bottom: ABOVE_CTA, left: PAD, width: CONTENT_WIDTH }, [
      displayText(props.copy.headline, headlineSize, charcoal, {
        maxWidth: balancedWidth(props.copy.headline, headlineSize, CONTENT_WIDTH)
      }),
      bodyText(props.copy.subline, 38, charcoal, { marginTop: 22 }, { opacity: 0.82, lineClamp: 2 }),
      box({ marginTop: 30, width: CONTENT_WIDTH }, [itemLine(props, { name: charcoal, price: tomato })])
    ]),
    layer({ bottom: PAD, left: PAD }, [ctaBlock(props.cta, { text: charcoal, muted: chili })])
  ]);
}

// ── full_bleed ──────────────────────────────────────────────────────────────

function fullBleed(props: PosterProps, photo: string | null): PosterNode {
  const tall = props.subject.photoTallDataUri ?? photo;
  const headlineSize = fitFont(props.copy.headline, {
    width: CONTENT_WIDTH,
    maxLines: 2,
    max: tall ? 132 : 160,
    min: 88
  });
  const decoration: (PosterNode | null)[] = tall
    ? fullBleedPhoto(tall)
    : [
        dotTexture(cream, 0.08),
        band(tomato, { top: 250, height: 430, rotate: -12 }, [
          displayText(props.subject.title, 300, cream, {}, { whiteSpace: "nowrap", lineHeight: 0.9 })
        ]),
        band(mustard, { top: 720, height: 64, rotate: -12 }),
        band(chili, { top: 810, height: 26, rotate: -12 })
      ];
  return canvas(charcoal, [
    ...decoration,
    stamp(soldStamp(props), {
      size: 330,
      fill: mustard,
      color: charcoal,
      rotate: 10,
      position: tall ? { top: 860, right: 48 } : { top: 700, right: 60 }
    }),
    layer({ top: PAD, left: PAD }, [
      brandBlock(props.branding, cream, tall ? { ring: cream, plate: "rgba(28,23,20,0.78)" } : { ring: cream })
    ]),
    // Type starts where the fade is near-solid, so it reads over any photo.
    // The subline is left out here: the dish carries this layout.
    layer({ bottom: ABOVE_CTA, left: PAD, width: CONTENT_WIDTH }, [
      displayText(props.copy.headline, headlineSize, cream, {
        maxWidth: balancedWidth(props.copy.headline, headlineSize, CONTENT_WIDTH)
      }),
      box({ marginTop: 20, width: CONTENT_WIDTH }, [itemLine(props, { name: cream, price: mustard }, CONTENT_WIDTH, 92)])
    ]),
    layer({ bottom: PAD, left: PAD }, [ctaBlock(props.cta, { text: cream, muted: mustard })])
  ]);
}

// ── stat_led ────────────────────────────────────────────────────────────────

function statLed(props: PosterProps, photo: string | null): PosterNode {
  const sold = props.subject.soldQty;
  const stat = sold && sold > 0 ? `${sold}+` : null;
  const lowerWidth = 560;
  const statHeadlineSize = fitFont(props.copy.headline, {
    width: CONTENT_WIDTH,
    maxLines: 2,
    max: 120,
    min: 84
  });

  const hero: (PosterNode | null)[] = stat
    ? [
        displayText(stat, fitFont(stat, { width: CONTENT_WIDTH, maxLines: 1, max: 600, min: 240 }), cream, {}, { lineHeight: 0.84 }),
        displayText("sold this month", 92, charcoal, { marginTop: 18 }),
        displayText(props.copy.headline, statHeadlineSize, cream, {
          marginTop: 46,
          maxWidth: balancedWidth(props.copy.headline, statHeadlineSize, CONTENT_WIDTH)
        })
      ]
    : [
        // Cold start: no number to lead with, so the headline is the hero.
        displayText(
          props.copy.headline,
          fitFont(props.copy.headline, { width: CONTENT_WIDTH, maxLines: 4, max: 230, min: 120 }),
          cream
        ),
        displayText("Must try", 92, charcoal, { marginTop: 30 })
      ];

  return canvas(tomato, [
    dotTexture(cream, 0.12),
    photo
      ? photoCircle(photo, 620, mustard, { top: 1010, right: -210 }, 20)
      : rings(680, [mustard, chili, mustard, tomato], { top: 980, right: -250 }, 0.18),
    layer({ top: PAD, left: PAD }, [brandBlock(props.branding, cream, { ring: cream })]),
    layer({ top: 230, left: PAD, width: CONTENT_WIDTH }, hero),
    layer({ bottom: ABOVE_CTA, left: PAD, width: lowerWidth }, [
      bodyText(props.copy.subline, 38, cream, {}, { lineClamp: 3 }),
      box({ marginTop: 34, flexDirection: "column", width: lowerWidth }, [
        bodyText(props.subject.title, 46, charcoal, {}, { lineClamp: 2 }),
        props.subject.priceLine
          ? displayText(props.subject.priceLine, 120, cream, { marginTop: 8 }, { lineHeight: 0.9 })
          : null
      ])
    ]),
    layer({ bottom: PAD, left: PAD }, [ctaBlock(props.cta, { text: cream, muted: charcoal })])
  ]);
}
