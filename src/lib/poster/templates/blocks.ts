// lib/poster/templates/blocks.ts
//
// Content pieces shared by the templates, sized per format.

import { balancedWidth, bodyText, displayText, fitFont, pick } from "../design";
import type { PosterFormat, PosterProps } from "../types";
import { box, type PosterNode } from "./node";

type PerFormat<T> = Record<PosterFormat, T>;

/** A display headline: biggest size that fits, balanced line widths. */
export function headline(
  value: string,
  color: string,
  width: number,
  sizes: { max: PerFormat<number>; min: PerFormat<number>; lines: PerFormat<number> },
  layout: Record<string, string | number> = {}
): PosterNode {
  const size = fitFont(value, { width, maxLines: pick(sizes.lines), max: pick(sizes.max), min: pick(sizes.min) });
  return displayText(value, size, color, { maxWidth: balancedWidth(value, size, width), ...layout });
}

export const HERO_HEADLINE = {
  max: { story: 160, portrait: 124, square: 96 },
  min: { story: 100, portrait: 80, square: 64 },
  lines: { story: 2, portrait: 2, square: 3 }
};

export function subline(value: string, color: string, layout: Record<string, string | number> = {}, lines = 2): PosterNode {
  return bodyText(value, pick({ story: 38, portrait: 34, square: 28 }), color, layout, { lineClamp: lines });
}

/**
 * Item name with its price: side by side when there's room, stacked in
 * narrow (square) columns.
 */
export function itemLine(
  props: PosterProps,
  colors: { name: string; price: string },
  width: number,
  priceSize = pick({ story: 112, portrait: 96, square: 76 })
): PosterNode {
  const price = props.subject.priceLine;
  const nameSize = pick({ story: 46, portrait: 40, square: 34 });
  if (width < 600) {
    return box({ flexDirection: "column", width }, [
      bodyText(props.subject.title, nameSize, colors.name, { maxWidth: width }, { lineClamp: 2 }),
      price ? displayText(price, priceSize, colors.price, { marginTop: 6 }, { lineHeight: 0.9 }) : null
    ]);
  }
  return box(
    { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", width },
    [
      bodyText(props.subject.title, nameSize, colors.name, { maxWidth: price ? width - 320 : width }, { lineClamp: 2 }),
      price ? displayText(price, priceSize, colors.price, { marginLeft: 24, flexShrink: 0 }, { lineHeight: 0.9 }) : null
    ]
  );
}

export function gap(size: PerFormat<number>): Record<string, number> {
  return { marginTop: pick(size) };
}
