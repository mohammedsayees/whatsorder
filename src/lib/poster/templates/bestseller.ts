// lib/poster/templates/bestseller.ts
//
// Bestseller / social-proof template. With get_bestsellers' cold-start
// fallback it always has something to say. One composition per generated
// variant (layoutForVariant), each laid out per format by templates/frames.ts:
//
//   photo_hero → heroFrame: dish (or AI cut-out) with the sold-count stamp
//   full_bleed → bleedFrame: dish fills the frame, type on the base colour
//   stat_led   → statFrame: the sold count is the hero
//
// The sold count appears exactly once; the café name exactly once.

import { bodyText, displayText, fitFont, pick, posterScheme } from "../design";
import type { PosterProps } from "../types";
import { HERO_HEADLINE, gap, headline, itemLine, subline } from "./blocks";
import { bleedFrame, heroFrame, statFrame, type StampLines } from "./frames";
import { box, type PosterNode } from "./node";

export function bestsellerTemplate(props: PosterProps): PosterNode {
  switch (props.layout) {
    case "full_bleed":
      return fullBleed(props);
    case "stat_led":
      return statLed(props);
    default:
      return photoHero(props);
  }
}

function soldStamp(props: PosterProps): StampLines {
  const sold = props.subject.soldQty;
  return sold && sold > 0 ? { big: `${sold}+`, small: "sold this month" } : { big: "Must try" };
}

function photoHero(props: PosterProps): PosterNode {
  const s = posterScheme(props.branding, "hero");
  return heroFrame(props, s, {
    stamp: soldStamp(props),
    content: (width) => [
      headline(props.copy.headline, s.text, width, HERO_HEADLINE),
      subline(props.copy.subline, s.text, gap({ story: 22, portrait: 18, square: 14 })),
      box({ ...gap({ story: 30, portrait: 24, square: 18 }), width }, [
        itemLine(props, { name: s.text, price: s.accent }, width)
      ])
    ]
  });
}

function fullBleed(props: PosterProps): PosterNode {
  const s = posterScheme(props.branding, "bleed");
  return bleedFrame(props, s, {
    stamp: soldStamp(props),
    // The subline is left out: the dish carries this layout.
    content: (width, colors) => [
      headline(props.copy.headline, colors.text, width, {
        max: { story: 132, portrait: 108, square: 88 },
        min: { story: 88, portrait: 72, square: 60 },
        lines: { story: 2, portrait: 2, square: 3 }
      }),
      box({ ...gap({ story: 20, portrait: 16, square: 14 }), width }, [
        itemLine(props, { name: colors.text, price: colors.accent }, width, pick({ story: 92, portrait: 80, square: 66 }))
      ])
    ]
  });
}

function statLed(props: PosterProps): PosterNode {
  const s = posterScheme(props.branding, "stat");
  const sold = props.subject.soldQty;
  const stat = sold && sold > 0 ? `${sold}+` : null;
  return statFrame(props, s, {
    stamp: null,
    top: (width) =>
      stat
        ? [
            displayText(
              stat,
              fitFont(stat, { width, maxLines: 1, max: pick({ story: 600, portrait: 420, square: 260 }), min: 160 }),
              s.accent,
              {},
              { lineHeight: 0.84 }
            ),
            displayText("sold this month", pick({ story: 92, portrait: 72, square: 58 }), s.text, gap({ story: 18, portrait: 12, square: 10 })),
            // Square has no room for the headline up here; it moves below.
            pick({ story: true, portrait: true, square: false })
              ? headline(props.copy.headline, s.text, width, {
                  max: { story: 120, portrait: 92, square: 72 },
                  min: { story: 84, portrait: 64, square: 52 },
                  lines: { story: 2, portrait: 2, square: 2 }
                }, gap({ story: 46, portrait: 30, square: 22 }))
              : null
          ]
        : [
            // Cold start: no number to lead with, so the headline is the hero.
            headline(props.copy.headline, s.text, width, {
              max: { story: 230, portrait: 150, square: 120 },
              min: { story: 120, portrait: 90, square: 72 },
              lines: { story: 4, portrait: 3, square: 3 }
            }),
            displayText("Must try", pick({ story: 92, portrait: 72, square: 58 }), s.accent, gap({ story: 30, portrait: 20, square: 16 }))
          ],
    lower: (width) => [
      pick({ story: false, portrait: false, square: Boolean(stat) })
        ? headline(props.copy.headline, s.text, width, {
            max: { story: 0, portrait: 0, square: 64 },
            min: { story: 0, portrait: 0, square: 46 },
            lines: { story: 2, portrait: 2, square: 2 }
          })
        : subline(props.copy.subline, s.text, {}, 3),
      box({ ...gap({ story: 34, portrait: 24, square: 18 }), flexDirection: "column", width }, [
        bodyText(props.subject.title, pick({ story: 46, portrait: 40, square: 34 }), s.text, {}, { lineClamp: 2 }),
        props.subject.priceLine
          ? displayText(props.subject.priceLine, pick({ story: 120, portrait: 96, square: 76 }), s.accent, { marginTop: 8 }, { lineHeight: 0.9 })
          : null
      ])
    ]
  });
}
