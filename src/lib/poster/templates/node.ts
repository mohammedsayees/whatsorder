// lib/poster/templates/node.ts
//
// Minimal element helpers for Satori templates. Templates are pure data:
// Satori accepts React-element-like plain objects, which keeps the poster
// pipeline free of React runtime/JSX concerns and makes purity structural —
// there is nowhere to put a hook or state.
//
// Satori constraints honored here (see brief §6.2):
// - inline styles only; flexbox + absolute positioning, no grid;
// - every element with more than one child declares display:flex — box()
//   bakes that in;
// - images are embedded as base64 data URIs by the props assembler.

export type PosterStyle = Record<string, string | number>;

export type PosterNode = {
  type: string;
  props: {
    style?: PosterStyle;
    src?: string;
    width?: number;
    height?: number;
    children?: PosterNode | string | (PosterNode | string)[];
  };
};

/** Container element; display:flex is always set (Satori requires it). */
export function box(
  style: PosterStyle,
  children: (PosterNode | string | null)[]
): PosterNode {
  return {
    type: "div",
    props: {
      style: { display: "flex", ...style },
      children: children.filter(
        (child): child is PosterNode | string => child !== null
      )
    }
  };
}

/** Leaf text element. */
export function text(style: PosterStyle, content: string): PosterNode {
  return { type: "div", props: { style, children: content } };
}

export function img(
  src: string,
  style: PosterStyle,
  size?: { width: number; height: number }
): PosterNode {
  return { type: "img", props: { src, style, ...size } };
}

/**
 * The only length-driven layout give in the system: a ±15% font-size safety
 * band. Length is solved at copy generation (hard character caps); this only
 * absorbs the difference between a short and a maximal string.
 */
export function fitFontSize(
  base: number,
  textValue: string,
  comfortableChars: number
): number {
  if (textValue.length <= comfortableChars) {
    return base;
  }
  const scale = Math.max(0.85, comfortableChars / textValue.length);
  return Math.round(base * scale);
}
