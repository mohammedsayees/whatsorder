// lib/poster/templates/new-item.ts
//
// New item template: announces a dish just added to the menu. No sales
// claims; the "NEW" stamp and price are code-owned.

import { bodyText, displayText, pick, posterScheme } from "../design";
import type { PosterProps } from "../types";
import { HERO_HEADLINE, gap, headline, itemLine, subline } from "./blocks";
import { bleedFrame, heroFrame, statFrame } from "./frames";
import { box, type PosterNode } from "./node";

const NEW_STAMP = { big: "New", small: "on the menu" };

export function newItemTemplate(props: PosterProps): PosterNode {
  switch (props.layout) {
    case "full_bleed": {
      const s = posterScheme(props.branding, "bleed");
      return bleedFrame(props, s, {
        stamp: NEW_STAMP,
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
    case "stat_led": {
      const s = posterScheme(props.branding, "stat");
      return statFrame(props, s, {
        stamp: null,
        top: (width) => [
          displayText("New", pick({ story: 420, portrait: 300, square: 220 }), s.accent, {}, { lineHeight: 0.84 }),
          displayText("on the menu", pick({ story: 92, portrait: 72, square: 58 }), s.text, gap({ story: 18, portrait: 12, square: 10 })),
          pick({ story: true, portrait: true, square: false })
            ? headline(props.copy.headline, s.text, width, {
                max: { story: 120, portrait: 92, square: 72 },
                min: { story: 84, portrait: 64, square: 52 },
                lines: { story: 2, portrait: 2, square: 2 }
              }, gap({ story: 46, portrait: 30, square: 22 }))
            : null
        ],
        lower: (width) => [
          pick({ story: false, portrait: false, square: true })
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
    default: {
      const s = posterScheme(props.branding, "hero");
      return heroFrame(props, s, {
        stamp: NEW_STAMP,
        content: (width) => [
          headline(props.copy.headline, s.text, width, HERO_HEADLINE),
          subline(props.copy.subline, s.text, gap({ story: 22, portrait: 18, square: 14 })),
          box({ ...gap({ story: 30, portrait: 24, square: 18 }), width }, [
            itemLine(props, { name: s.text, price: s.accent }, width)
          ])
        ]
      });
    }
  }
}
