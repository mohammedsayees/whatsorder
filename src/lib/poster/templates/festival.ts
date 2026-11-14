// lib/poster/templates/festival.ts
//
// Festival greeting template (Ramadan, Eid, UAE National Day; Diwali, Holi,
// Independence Day for India). The greeting is code-owned (festivals.ts) —
// the AI writes only the supporting line — and the ornaments are drawn in
// code. An optional featured dish adds its photo and price.

import { bodyText, displayText, fitFont, pick, posterScheme } from "../design";
import { FESTIVALS, type Festival } from "../festivals";
import { festivalOrnament } from "../ornaments";
import type { PosterProps } from "../types";
import { gap, headline, itemLine, subline } from "./blocks";
import { bleedFrame, heroFrame, statFrame } from "./frames";
import { box, type PosterNode } from "./node";

function festivalOf(props: PosterProps): Festival {
  return FESTIVALS[props.subject.festival ?? "eid_al_fitr"];
}

/** Lead greeting (Arabic first on Arabic posters) and the other language below it. */
function greetings(props: PosterProps): { lead: string; second: string | null } {
  const festival = festivalOf(props);
  if (props.language === "ar" && festival.greetingAr) {
    return { lead: festival.greetingAr, second: festival.greeting };
  }
  return { lead: festival.greeting, second: festival.greetingAr ?? null };
}

function greetingBlock(props: PosterProps, color: string, width: number, max: number, lines: number): PosterNode[] {
  const { lead, second } = greetings(props);
  return [
    displayText(lead, fitFont(lead, { width, maxLines: lines, max, min: Math.round(max * 0.5) }), color),
    second
      ? bodyText(second, pick({ story: 52, portrait: 44, square: 34 }), color, gap({ story: 10, portrait: 8, square: 6 }), { lineClamp: 1 })
      : null
  ].filter((node): node is PosterNode => node !== null);
}

function hasDish(props: PosterProps): boolean {
  return Boolean(props.subject.priceLine);
}

export function festivalTemplate(props: PosterProps): PosterNode {
  const festival = festivalOf(props);
  switch (props.layout) {
    case "full_bleed": {
      const s = posterScheme(props.branding, "bleed");
      return bleedFrame(props, s, {
        stamp: null,
        bandText: festival.greeting,
        content: (width, colors) => [
          ...greetingBlock(props, colors.text, width, pick({ story: 150, portrait: 120, square: 90 }), 2),
          headline(props.copy.headline, colors.accent, width, {
            max: { story: 72, portrait: 60, square: 48 },
            min: { story: 52, portrait: 44, square: 36 },
            lines: { story: 2, portrait: 2, square: 2 }
          }, gap({ story: 22, portrait: 16, square: 12 })),
          hasDish(props)
            ? box({ ...gap({ story: 22, portrait: 16, square: 12 }), width }, [
                itemLine(props, { name: colors.text, price: colors.accent }, width, pick({ story: 80, portrait: 68, square: 56 }))
              ])
            : null
        ]
      });
    }
    case "stat_led": {
      const s = posterScheme(props.branding, "stat");
      return statFrame(props, s, {
        stamp: null,
        noPhotoArt: [
          festivalOrnament(
            festival.ornament,
            festival.colours,
            pick({ story: 640, portrait: 460, square: 440 }),
            pick({ story: { top: 990, right: -120 }, portrait: { top: 680, right: -90 }, square: { top: 470, right: -80 } })
          )
        ],
        top: (width) => greetingBlock(props, s.accent, width, pick({ story: 240, portrait: 170, square: 120 }), 3),
        lower: (width) => [
          headline(props.copy.headline, s.text, width, {
            max: { story: 96, portrait: 76, square: 56 },
            min: { story: 64, portrait: 52, square: 40 },
            lines: { story: 3, portrait: 2, square: 2 }
          }),
          hasDish(props)
            ? box({ ...gap({ story: 24, portrait: 16, square: 12 }), flexDirection: "column", width }, [
                bodyText(props.subject.title, pick({ story: 44, portrait: 38, square: 30 }), s.text, {}, { lineClamp: 1 }),
                displayText(props.subject.priceLine ?? "", pick({ story: 104, portrait: 84, square: 64 }), s.accent, { marginTop: 6 }, { lineHeight: 0.9 })
              ])
            : subline(props.copy.subline, s.text, gap({ story: 18, portrait: 12, square: 8 }))
        ]
      });
    }
    default: {
      const s = posterScheme(props.branding, "hero");
      return heroFrame(props, s, {
        stamp: null,
        noPhotoArt: [
          festivalOrnament(
            festival.ornament,
            festival.colours,
            pick({ story: 860, portrait: 580, square: 500 }),
            pick({ story: { top: 160, left: 160 }, portrait: { top: 90, left: 400 }, square: { top: 110, left: 540 } })
          )
        ],
        content: (width) => [
          ...greetingBlock(props, s.text, width, pick({ story: 170, portrait: 130, square: 92 }), 2),
          headline(props.copy.headline, s.accent, width, {
            max: { story: 72, portrait: 60, square: 46 },
            min: { story: 52, portrait: 44, square: 34 },
            lines: { story: 2, portrait: 2, square: 2 }
          }, gap({ story: 20, portrait: 14, square: 10 })),
          hasDish(props)
            ? box({ ...gap({ story: 24, portrait: 18, square: 12 }), width }, [itemLine(props, { name: s.text, price: s.accent }, width)])
            : subline(props.copy.subline, s.text, gap({ story: 18, portrait: 12, square: 8 }))
        ]
      });
    }
  }
}
