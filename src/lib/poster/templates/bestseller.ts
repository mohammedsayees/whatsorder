// lib/poster/templates/bestseller.ts
//
// Bestseller / social-proof template. With get_bestsellers' cold-start
// fallback it always has something to say. Three compositions (one per
// generated variant, see layoutForVariant), each with a photo-less form:
//
//   photo_hero — dish in a big ringed circle bleeding off the edge, a rotated
//                sold-count stamp overlapping it (no photo: the item name as
//                oversized cropped lettering)
//   full_bleed — the dish fills the top of the frame, a short soft fade into
//                the base colour carries the type (no photo: diagonal bands)
//   stat_led   — the sold count is the hero (no sales yet: the headline is),
//                photo in a circle at the edge (no photo: concentric rings)
//
// Colours come from the restaurant palette via posterScheme (text always at
// >= 4.5:1); type, stamp shape and decoration from the active theme. The sold
// count appears exactly once; the café name exactly once (brand block).

import {
  ABOVE_CTA,
  CONTENT_WIDTH,
  PAD,
  balancedWidth,
  band,
  bandLettering,
  bodyText,
  brandBlock,
  canvas,
  ctaBlock,
  disc,
  displayText,
  fitFont,
  fullBleedPhoto,
  giantLettering,
  layer,
  photoCircle,
  posterScheme,
  rgbList,
  rings,
  stamp,
  texture,
  type PosterScheme
} from "../design";
import type { PosterProps } from "../types";
import { box, type PosterNode } from "./node";

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

export function plateFor(s: PosterScheme): string {
  return `rgba(${rgbList(s.base)},0.78)`;
}

// ── photo_hero ──────────────────────────────────────────────────────────────

function photoHero(props: PosterProps, photo: string | null): PosterNode {
  const s = posterScheme(props.branding, "hero");
  const headlineSize = fitFont(props.copy.headline, {
    width: CONTENT_WIDTH,
    maxLines: 2,
    max: 160,
    min: 100
  });
  return canvas(
    s.bg,
    [
      texture(s.text, 0.12),
      disc(1180, s.decoA, { top: -420, right: -520 }),
      photo
        ? photoCircle(photo, 860, s.ring, { top: 120, right: -120 })
        : giantLettering(props.subject.title, {
            size: 460,
            color: s.decoA,
            rotate: -8,
            position: { top: 130, left: -40 }
          }),
      photo
        ? null
        : giantLettering(props.subject.title, {
            size: 460,
            color: s.decoB,
            rotate: -8,
            position: { top: 520, left: -330 }
          }),
      stamp(soldStamp(props), {
        size: 340,
        fill: s.stampFill,
        color: s.stampText,
        rotate: -12,
        position: photo ? { top: 690, left: 40 } : { top: 250, right: 70 }
      }),
      layer({ top: PAD, left: PAD }, [brandBlock(props.branding, s.text, { ring: s.ring })]),
      layer({ bottom: ABOVE_CTA, left: PAD, width: CONTENT_WIDTH }, [
        displayText(props.copy.headline, headlineSize, s.text, {
          maxWidth: balancedWidth(props.copy.headline, headlineSize, CONTENT_WIDTH)
        }),
        bodyText(props.copy.subline, 38, s.text, { marginTop: 22 }, { lineClamp: 2 }),
        box({ marginTop: 30, width: CONTENT_WIDTH }, [itemLine(props, { name: s.text, price: s.accent })])
      ]),
      layer({ bottom: PAD, left: PAD }, [ctaBlock(props.cta, { text: s.text, muted: s.accent })])
    ],
    s.accent
  );
}

// ── full_bleed ──────────────────────────────────────────────────────────────

function fullBleed(props: PosterProps, photo: string | null): PosterNode {
  const s = posterScheme(props.branding, "bleed");
  const tall = props.subject.photoTallDataUri ?? photo;
  const headlineSize = fitFont(props.copy.headline, {
    width: CONTENT_WIDTH,
    maxLines: 2,
    max: tall ? 132 : 160,
    min: 88
  });
  // With a photo the type sits on the solid base below it; without one the
  // whole field is the theme's bleed colour.
  const text = tall ? s.onBase : s.text;
  const accent = tall ? s.accentOnBase : s.accent;
  const decoration: (PosterNode | null)[] = tall
    ? fullBleedPhoto(tall, s)
    : [
        texture(s.text, 0.08),
        band(s.decoA, { top: 250, height: 430, rotate: -12 }, [
          bandLettering(props.subject.title, 300, { fill: s.onDecoA, stroke: s.decoA })
        ]),
        band(s.decoB, { top: 720, height: 64, rotate: -12 }),
        band(s.palette.primaryDeep, { top: 810, height: 26, rotate: -12 })
      ];
  return canvas(
    tall ? s.base : s.bg,
    [
      ...decoration,
      stamp(soldStamp(props), {
        size: 330,
        fill: s.stampFill,
        color: s.stampText,
        rotate: 10,
        position: tall ? { top: 860, right: 48 } : { top: 700, right: 60 }
      }),
      layer({ top: PAD, left: PAD }, [
        brandBlock(
          props.branding,
          tall ? s.onBase : s.text,
          tall ? { ring: s.palette.light, plate: plateFor(s) } : { ring: s.ring }
        )
      ]),
      // Type starts where the fade is near-solid, so it reads over any photo.
      // The subline is left out here: the dish carries this layout.
      layer({ bottom: ABOVE_CTA, left: PAD, width: CONTENT_WIDTH }, [
        displayText(props.copy.headline, headlineSize, text, {
          maxWidth: balancedWidth(props.copy.headline, headlineSize, CONTENT_WIDTH)
        }),
        box({ marginTop: 20, width: CONTENT_WIDTH }, [itemLine(props, { name: text, price: accent }, CONTENT_WIDTH, 92)])
      ]),
      layer({ bottom: PAD, left: PAD }, [ctaBlock(props.cta, { text, muted: accent })])
    ],
    accent
  );
}

// ── stat_led ────────────────────────────────────────────────────────────────

function statLed(props: PosterProps, photo: string | null): PosterNode {
  const s = posterScheme(props.branding, "stat");
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
        displayText(stat, fitFont(stat, { width: CONTENT_WIDTH, maxLines: 1, max: 600, min: 240 }), s.accent, {}, { lineHeight: 0.84 }),
        displayText("sold this month", 92, s.text, { marginTop: 18 }),
        displayText(props.copy.headline, statHeadlineSize, s.text, {
          marginTop: 46,
          maxWidth: balancedWidth(props.copy.headline, statHeadlineSize, CONTENT_WIDTH)
        })
      ]
    : [
        // Cold start: no number to lead with, so the headline is the hero.
        displayText(
          props.copy.headline,
          fitFont(props.copy.headline, { width: CONTENT_WIDTH, maxLines: 4, max: 230, min: 120 }),
          s.text
        ),
        displayText("Must try", 92, s.accent, { marginTop: 30 })
      ];

  return canvas(
    s.bg,
    [
      texture(s.text, 0.12),
      photo
        ? photoCircle(photo, 620, s.decoB, { top: 1010, right: -210 }, 20)
        : rings(680, [s.decoB, s.decoA, s.decoB, s.bg], { top: 980, right: -250 }, 0.18),
      layer({ top: PAD, left: PAD }, [brandBlock(props.branding, s.text, { ring: s.ring })]),
      layer({ top: 230, left: PAD, width: CONTENT_WIDTH }, hero),
      layer({ bottom: ABOVE_CTA, left: PAD, width: lowerWidth }, [
        bodyText(props.copy.subline, 38, s.text, {}, { lineClamp: 3 }),
        box({ marginTop: 34, flexDirection: "column", width: lowerWidth }, [
          bodyText(props.subject.title, 46, s.text, {}, { lineClamp: 2 }),
          props.subject.priceLine
            ? displayText(props.subject.priceLine, 120, s.accent, { marginTop: 8 }, { lineHeight: 0.9 })
            : null
        ])
      ]),
      layer({ bottom: PAD, left: PAD }, [ctaBlock(props.cta, { text: s.text, muted: s.accent })])
    ],
    s.accent
  );
}
