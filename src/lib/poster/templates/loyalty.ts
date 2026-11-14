// lib/poster/templates/loyalty.ts
//
// Loyalty stamp-card template. The stamp count and reward come from the
// restaurant's loyalty settings (never the AI); the card is drawn in code.

import { bodyText, displayText, fitFont, pick, posterScheme, type PosterScheme } from "../design";
import { stampCard } from "../ornaments";
import type { PosterProps } from "../types";
import { HERO_HEADLINE, gap, headline, subline } from "./blocks";
import { bleedFrame, heroFrame, statFrame } from "./frames";
import type { PosterNode } from "./node";

function terms(props: PosterProps) {
  return props.subject.loyalty ?? { stamps: 10, reward: props.subject.title };
}

/** "Collect 10 stamps, get a free karak" — numbers from tenant data. */
function termsLine(props: PosterProps, color: string, layout: Record<string, number> = {}): PosterNode {
  const { stamps, reward } = terms(props);
  return bodyText(`Collect ${stamps} stamps, get ${reward}`, pick({ story: 44, portrait: 38, square: 30 }), color, layout, {
    lineClamp: 2
  });
}

function card(props: PosterProps, s: PosterScheme, region: { width: number; height: number; position: Record<string, number> }) {
  return stampCard(
    terms(props).stamps,
    { card: s.palette.light, ink: s.palette.dark, accent: s.stampFill },
    { width: region.width, height: region.height },
    region.position
  );
}

export function loyaltyTemplate(props: PosterProps): PosterNode {
  switch (props.layout) {
    case "full_bleed": {
      const s = posterScheme(props.branding, "bleed");
      return bleedFrame(props, s, {
        stamp: null,
        bandText: `${terms(props).stamps} stamps`,
        content: (width, colors) => [
          headline(props.copy.headline, colors.text, width, {
            max: { story: 140, portrait: 112, square: 88 },
            min: { story: 88, portrait: 72, square: 56 },
            lines: { story: 2, portrait: 2, square: 3 }
          }),
          termsLine(props, colors.accent, gap({ story: 22, portrait: 16, square: 12 }))
        ]
      });
    }
    case "stat_led": {
      const s = posterScheme(props.branding, "stat");
      const { stamps, reward } = terms(props);
      return statFrame(props, s, {
        stamp: null,
        noPhotoArt: [
          card(
            props,
            s,
            pick({
              story: { width: 560, height: 360, position: { top: 1060, right: -40 } },
              portrait: { width: 440, height: 290, position: { top: 700, right: -30 } },
              square: { width: 420, height: 280, position: { top: 500, right: -20 } }
            })
          )
        ],
        top: (width) => [
          displayText(String(stamps), fitFont(String(stamps), { width, maxLines: 1, max: pick({ story: 560, portrait: 400, square: 260 }), min: 160 }), s.accent, {}, {
            lineHeight: 0.84
          }),
          displayText(`stamps = ${reward}`, fitFont(`stamps = ${reward}`, { width, maxLines: 2, max: pick({ story: 92, portrait: 72, square: 56 }), min: 40 }), s.text, gap({ story: 18, portrait: 12, square: 10 }))
        ],
        lower: (width) => [
          headline(props.copy.headline, s.text, width, {
            max: { story: 100, portrait: 80, square: 60 },
            min: { story: 72, portrait: 56, square: 44 },
            lines: { story: 3, portrait: 2, square: 2 }
          }),
          pick({ story: true, portrait: true, square: false }) ? subline(props.copy.subline, s.text, gap({ story: 18, portrait: 12, square: 8 })) : null
        ]
      });
    }
    default: {
      const s = posterScheme(props.branding, "hero");
      return heroFrame(props, s, {
        stamp: null,
        noPhotoArt: [
          card(
            props,
            s,
            pick({
              story: { width: 860, height: 560, position: { top: 260, left: 110 } },
              portrait: { width: 620, height: 400, position: { top: 150, left: 230 } },
              square: { width: 470, height: 330, position: { top: 150, left: 550 } }
            })
          )
        ],
        content: (width) => [
          headline(props.copy.headline, s.text, width, HERO_HEADLINE),
          subline(props.copy.subline, s.text, gap({ story: 22, portrait: 18, square: 14 })),
          termsLine(props, s.accent, gap({ story: 26, portrait: 20, square: 14 }))
        ]
      });
    }
  }
}
