// lib/poster/templates/offer.ts
//
// Offer / promo template — highest order intent. Price text is rendered
// verbatim from the offers table (formatted server-side) and the saving stamp
// is computed in code from the real regular and promotional prices
// (offer-math.ts); the AI contributes headline/subline only.
//
//   photo_hero → archFrame: dish in an arch (or the cut-out bursting out of
//                it); no photo: the arch holds the giant price
//   full_bleed → bleedFrame: price is the hero on the base colour
//   stat_led   → statFrame: the price itself is the hero

import { bodyText, displayText, fitFont, pick, posterScheme, priceRow } from "../design";
import type { PosterProps } from "../types";
import { gap, headline, subline } from "./blocks";
import { archFrame, bleedFrame, statFrame, type StampLines } from "./frames";
import type { PosterNode } from "./node";

export function offerTemplate(props: PosterProps): PosterNode {
  switch (props.layout) {
    case "full_bleed":
      return fullBleed(props);
    case "stat_led":
      return priceLed(props);
    default:
      return archHero(props);
  }
}

/** "25% OFF" → big "25%" + small "off"; "SAVE AED 4" → big "AED 4" + small "you save". */
export function savingStampLines(label: string | null | undefined): StampLines | null {
  if (!label) return null;
  const percent = label.match(/^(\d+%)\s+OFF$/i);
  const save = label.match(/^SAVE\s+(.+)$/i);
  return percent ? { big: percent[1], small: "off" } : save ? { big: save[1], small: "you save" } : { big: label };
}

function priceSize(price: string | null, width: number, max: number): number {
  return price ? fitFont(price, { width, maxLines: 1, max, min: 72 }) : 0;
}

function archHero(props: PosterProps): PosterNode {
  const s = posterScheme(props.branding, "arch");
  const { priceLine, originalPriceLine, photoDataUri: photo } = props.subject;
  return archFrame(props, s, {
    stamp: savingStampLines(props.subject.savingLabel),
    archContent: (archWidth) => [
      bodyText(
        props.subject.title,
        pick({ story: 48, portrait: 40, square: 32 }),
        s.onDecoA,
        { maxWidth: archWidth - 120, marginTop: pick({ story: 200, portrait: 150, square: 190 }) },
        { textAlign: "center", lineClamp: 2 }
      ),
      priceLine
        ? displayText(
            priceLine,
            priceSize(priceLine, archWidth - 100, pick({ story: 300, portrait: 220, square: 170 })),
            s.onDecoA,
            gap({ story: 18, portrait: 14, square: 10 }),
            { lineHeight: 0.9 }
          )
        : null,
      originalPriceLine
        ? bodyText(originalPriceLine, pick({ story: 54, portrait: 44, square: 36 }), s.accentOnDecoA, gap({ story: 12, portrait: 10, square: 8 }), {
            textDecoration: "line-through"
          })
        : null
    ],
    content: (width) => [
      headline(props.copy.headline, s.text, width, {
        max: { story: photo ? 128 : 170, portrait: photo ? 104 : 130, square: photo ? 84 : 100 },
        min: { story: 88, portrait: 72, square: 56 },
        lines: { story: photo ? 2 : 3, portrait: 2, square: 3 }
      }),
      photo
        ? priceRow(priceLine, originalPriceLine, {
            size: priceSize(priceLine, width - (width < 600 ? 0 : 300), pick({ story: 210, portrait: 170, square: 120 })),
            color: s.accent,
            strikeColor: s.text,
            layout: gap({ story: 22, portrait: 16, square: 12 })
          })
        : subline(props.copy.subline, s.text, gap({ story: 24, portrait: 18, square: 14 })),
      photo
        ? bodyText(props.subject.title, pick({ story: 44, portrait: 38, square: 30 }), s.text, gap({ story: 14, portrait: 10, square: 8 }), {
            lineClamp: 1
          })
        : null
    ]
  });
}

function fullBleed(props: PosterProps): PosterNode {
  const s = posterScheme(props.branding, "bleed");
  const { priceLine, originalPriceLine } = props.subject;
  const hasVisual = Boolean(props.subject.photoDataUri ?? props.subject.backgroundDataUri);
  return bleedFrame(props, s, {
    stamp: savingStampLines(props.subject.savingLabel),
    content: (width, colors) => [
      priceRow(priceLine, originalPriceLine, {
        size: priceSize(priceLine, width - (width < 600 ? 0 : 300), pick({ story: 190, portrait: 160, square: 120 })),
        color: colors.accent,
        strikeColor: colors.text
      }),
      bodyText(props.subject.title, pick({ story: 40, portrait: 36, square: 30 }), colors.text, gap({ story: 10, portrait: 8, square: 6 }), {
        lineClamp: 1
      }),
      headline(props.copy.headline, colors.text, width, {
        max: { story: hasVisual ? 100 : 140, portrait: hasVisual ? 86 : 110, square: 72 },
        min: { story: 64, portrait: 56, square: 48 },
        lines: { story: hasVisual ? 1 : 2, portrait: hasVisual ? 1 : 2, square: 2 }
      }, gap({ story: 18, portrait: 14, square: 10 }))
    ]
  });
}

function priceLed(props: PosterProps): PosterNode {
  const s = posterScheme(props.branding, "price");
  const { priceLine, originalPriceLine } = props.subject;
  const hasStamp = Boolean(props.subject.savingLabel);
  return statFrame(props, s, {
    stamp: savingStampLines(props.subject.savingLabel),
    top: (width) => {
      const titleWidth = hasStamp ? width - pick({ story: 300, portrait: 240, square: 200 }) : width;
      return [
        displayText(
          props.subject.title,
          fitFont(props.subject.title, {
            width: titleWidth,
            maxLines: 3,
            max: pick({ story: 120, portrait: 92, square: 64 }),
            min: pick({ story: 76, portrait: 60, square: 44 })
          }),
          s.text,
          { maxWidth: titleWidth }
        ),
        priceLine
          ? displayText(priceLine, priceSize(priceLine, width, pick({ story: 360, portrait: 260, square: 170 })), s.accent, gap({ story: 24, portrait: 16, square: 12 }), {
              lineHeight: 0.86
            })
          : null,
        originalPriceLine
          ? bodyText(`Was ${originalPriceLine}`, pick({ story: 52, portrait: 44, square: 36 }), s.text, gap({ story: 18, portrait: 12, square: 8 }), {
              textDecoration: "line-through"
            })
          : null
      ];
    },
    lower: (width) => [
      headline(props.copy.headline, s.text, width, {
        max: { story: 104, portrait: 84, square: 64 },
        min: { story: 72, portrait: 60, square: 48 },
        lines: { story: 3, portrait: 2, square: 2 }
      }),
      pick({ story: true, portrait: true, square: false })
        ? subline(props.copy.subline, s.accent, gap({ story: 20, portrait: 14, square: 10 }))
        : null
    ]
  });
}
