// lib/poster/design.ts
//
// Poster design system: palette, type helpers, and the shared pieces every
// template composes — brand block, WhatsApp call-to-action with QR, saving
// stamp, photo shapes and code-drawn decoration. Satori constraints apply:
// flexbox + absolute positioning, inline styles, data-URI images only.
//
// Every number shown on a poster arrives already formatted from tenant data
// (subjects.ts / offer-math.ts); nothing here computes or invents a figure.

import { BODY_FONT, DISPLAY_FONT } from "./fonts";
import { hasArabic, visualWordOrder } from "./bidi";
import type { PosterBranding, PosterCallToAction } from "./types";
import { POSTER_WIDTH } from "./types";
import { box, img, text, type PosterNode, type PosterStyle } from "./templates/node";

// Food-poster palette (warm, appetite-led). Phase 5 replaces this fixed set
// with a per-restaurant palette passed in through PosterBranding.
export const PALETTE = {
  charcoal: "#1c1714",
  cream: "#fff3df",
  tomato: "#e0412f",
  chili: "#9e2a1f",
  mustard: "#f5b82e",
  leaf: "#2f7d4f",
  white: "#ffffff",
  whatsapp: "#25d366"
} as const;

export const PAD = 72;
export const CONTENT_WIDTH = POSTER_WIDTH - PAD * 2;
/**
 * Lower content blocks are anchored this far from the bottom edge — just
 * above the call-to-action — so longer copy grows upward instead of running
 * into the CTA.
 */
export const ABOVE_CTA = 304;

export { BODY_FONT, DISPLAY_FONT };

// ── text fitting ────────────────────────────────────────────────────────────

/** Approximate advance per character, in em (uppercase Anton / Bricolage). */
export const DISPLAY_CHAR_EM = 0.5;
export const BODY_CHAR_EM = 0.52;
/** Measured joined Cairo Bold Arabic averages ~0.61–0.71em per character. */
const ARABIC_CHAR_EM = 0.68;

function charEmFor(value: string, latinEm: number): number {
  return hasArabic(value) ? Math.max(latinEm, ARABIC_CHAR_EM) : latinEm;
}

function wrapEstimate(
  value: string,
  fontSize: number,
  width: number,
  charEm: number
): { lines: number; overflow: boolean } {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const space = fontSize * 0.24;
  let lines = 1;
  let current = 0;
  let overflow = false;
  for (const word of words) {
    const wordWidth = word.length * charEm * fontSize;
    if (wordWidth > width) overflow = true;
    if (current === 0) {
      current = wordWidth;
    } else if (current + space + wordWidth <= width) {
      current += space + wordWidth;
    } else {
      lines += 1;
      current = wordWidth;
    }
  }
  return { lines, overflow };
}

/**
 * Largest font size (stepping down from `max`) at which `value` fits within
 * `maxLines` lines of `width`. Short headlines get poster-scale type; long
 * ones step down rather than overflow.
 */
export function fitFont(
  value: string,
  options: { width: number; maxLines: number; max: number; min: number; charEm?: number }
): number {
  const charEm = charEmFor(value, options.charEm ?? DISPLAY_CHAR_EM);
  for (let size = options.max; size > options.min; size -= 4) {
    const { lines, overflow } = wrapEstimate(value, size, options.width, charEm);
    if (!overflow && lines <= options.maxLines) {
      return size;
    }
  }
  return options.min;
}

// ── Arabic-aware text ───────────────────────────────────────────────────────

/**
 * A text element that renders Arabic correctly. Latin-only text is a plain
 * node. Satori joins Arabic letters but neither reorders words nor measures
 * joined words correctly, so text containing Arabic is wrapped here (by an
 * estimate), each line's words are put into VISUAL order (bidi.ts) and the
 * line is rendered as one unbreakable token (words joined with no-break
 * spaces). Result: correct right-to-left word order with tight spacing.
 *
 * `layout` styles (margins, width) apply to the outer element either way.
 */
export function richText(
  value: string,
  style: PosterStyle,
  layout: PosterStyle = {}
): PosterNode {
  if (!hasArabic(value)) {
    return text({ ...style, ...layout }, value);
  }
  const fontSize = typeof style.fontSize === "number" ? style.fontSize : 48;
  const maxWidth =
    typeof layout.maxWidth === "number"
      ? layout.maxWidth
      : typeof layout.width === "number"
        ? layout.width
        : CONTENT_WIDTH;
  const maxLines = typeof style.lineClamp === "number" ? style.lineClamp : 6;

  const lines: string[][] = [];
  let current: string[] = [];
  let currentWidth = 0;
  for (const word of value.trim().split(/\s+/)) {
    const wordWidth = word.length * ARABIC_CHAR_EM * fontSize;
    const space = fontSize * 0.3;
    if (current.length > 0 && currentWidth + space + wordWidth > maxWidth) {
      lines.push(current);
      current = [];
      currentWidth = 0;
    }
    currentWidth += (current.length ? space : 0) + wordWidth;
    current.push(word);
  }
  if (current.length) lines.push(current);
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    const last = shown[shown.length - 1];
    last[last.length - 1] = `${last[last.length - 1]}…`;
  }

  const { lineClamp: _lineClamp, ...lineStyle } = style;
  void _lineClamp;
  // Arabic ascenders/descenders need more room than Anton's tight leading.
  const lineHeight = Math.max(typeof style.lineHeight === "number" ? style.lineHeight : 1.2, 1.32);
  const centred = layout.textAlign === "center" || style.textAlign === "center";
  return box(
    {
      flexDirection: "column",
      alignItems: centred ? "center" : "flex-start",
      ...layout
    },
    shown.map((lineWords) =>
      text({ ...lineStyle, lineHeight, whiteSpace: "nowrap" }, visualWordOrder(lineWords.join(" ")).join("\u00a0"))
    )
  );
}

/**
 * Width that wraps `value` into evenly filled lines (no orphan last word),
 * never wider than `maxWidth`. Display headlines only.
 */
export function balancedWidth(
  value: string,
  size: number,
  maxWidth: number,
  latinCharEm = DISPLAY_CHAR_EM
): number {
  // Arabic lines are wrapped by richText itself; leave their width alone.
  if (hasArabic(value)) return maxWidth;
  const charEm = latinCharEm;
  const { lines } = wrapEstimate(value, size, maxWidth, charEm);
  if (lines <= 1) return maxWidth;
  const words = value.trim().split(/\s+/);
  const total =
    words.reduce((sum, word) => sum + word.length * charEm * size, 0) +
    (words.length - 1) * size * 0.24;
  const longest = Math.max(...words.map((word) => word.length * charEm * size));
  return Math.min(maxWidth, Math.max(longest, Math.ceil((total / lines) * 1.14)));
}

export function displayText(
  value: string,
  size: number,
  color: string,
  layout: PosterStyle = {},
  extra: PosterStyle = {}
): PosterNode {
  return richText(
    value,
    {
      fontFamily: DISPLAY_FONT,
      fontSize: size,
      lineHeight: 0.98,
      color,
      textTransform: "uppercase",
      ...extra
    },
    layout
  );
}

export function bodyText(
  value: string,
  size: number,
  color: string,
  layout: PosterStyle = {},
  extra: PosterStyle = {}
): PosterNode {
  return richText(
    value,
    {
      fontFamily: BODY_FONT,
      fontWeight: 700,
      fontSize: size,
      lineHeight: 1.25,
      color,
      ...extra
    },
    layout
  );
}

// ── SVG artwork (embedded as data URIs) ─────────────────────────────────────

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function starburstPoints(spikes: number, outer: number, inner: number): string {
  const points: string[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI * i) / spikes - Math.PI / 2;
    points.push(
      `${(50 + radius * Math.cos(angle)).toFixed(2)},${(50 + radius * Math.sin(angle)).toFixed(2)}`
    );
  }
  return points.join(" ");
}

function starburstSvg(fill: string, ring: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="${starburstPoints(22, 50, 44)}" fill="${fill}"/><circle cx="50" cy="50" r="38.5" fill="none" stroke="${ring}" stroke-width="1.2" stroke-dasharray="2.2 2"/></svg>`;
}

// Chat bubble + handset (handset path: Material "call" icon, Apache-2.0).
function whatsappGlyphSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M24 3C12.4 3 3 12 3 23.2c0 3.9 1.1 7.5 3.1 10.6L3.4 44.6l11.3-2.9c2.8 1.5 6 2.3 9.3 2.3 11.6 0 21-9 21-20.2S35.6 3 24 3z" fill="${PALETTE.whatsapp}"/><g transform="translate(12 11.5) scale(1)"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" fill="#ffffff"/></g></svg>`;
}

// Satori doesn't tile images, so the texture is one canvas-sized SVG whose
// rect is filled with a repeating <pattern>.
function dotGridSvg(
  color: string,
  opacity: number,
  spacing: number,
  radius: number,
  height: number
): string {
  const tile = spacing * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}"><defs><pattern id="d" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse"><g fill="${color}" fill-opacity="${opacity}"><circle cx="${spacing / 2}" cy="${spacing / 2}" r="${radius}"/><circle cx="${spacing * 1.5}" cy="${spacing * 1.5}" r="${radius}"/></g></pattern></defs><rect width="1080" height="${height}" fill="url(#d)"/></svg>`;
}

// ── shared pieces ───────────────────────────────────────────────────────────

/**
 * The café's identity, shown ONCE per poster: logo (when there is one) with
 * the name beside it.
 */
export function brandBlock(
  branding: PosterBranding,
  color: string,
  options: { ring?: string; size?: number; plate?: string } = {}
): PosterNode {
  const size = options.size ?? 92;
  // Over a photo the name sits on a dark plate so it reads on any image.
  const plate: PosterStyle = options.plate
    ? {
        backgroundColor: options.plate,
        borderRadius: 999,
        padding: branding.logoDataUri ? "8px 30px 8px 8px" : "16px 30px"
      }
    : {};
  return box({ flexDirection: "row", alignItems: "center", maxWidth: CONTENT_WIDTH, ...plate }, [
    branding.logoDataUri
      ? box(
          {
            width: size + 12,
            height: size + 12,
            borderRadius: 999,
            backgroundColor: options.ring ?? PALETTE.white,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 22,
            flexShrink: 0
          },
          [
            img(branding.logoDataUri, {
              width: size,
              height: size,
              borderRadius: 999,
              objectFit: "cover"
            })
          ]
        )
      : null,
    bodyText(
      branding.restaurantName,
      branding.logoDataUri ? 38 : 44,
      color,
      { maxWidth: CONTENT_WIDTH - (branding.logoDataUri ? size + 40 : 0) },
      { lineClamp: 1, letterSpacing: 0.5 }
    )
  ]);
}

/**
 * Call to action: WhatsApp glyph + "Order on WhatsApp", and the QR code of
 * the poster's tracked store link when present.
 */
export function ctaBlock(
  cta: PosterCallToAction | undefined,
  colors: { text: string; muted: string },
  layout: PosterStyle = {}
): PosterNode {
  const qr = cta?.qrDataUri ?? null;
  return box(
    {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      width: CONTENT_WIDTH,
      ...layout
    },
    [
      box({ flexDirection: "column", flexShrink: 1 }, [
        box({ flexDirection: "row", alignItems: "center" }, [
          img(svgDataUri(whatsappGlyphSvg()), { width: 88, height: 88, marginRight: 22 }),
          text(
            {
              fontFamily: DISPLAY_FONT,
              fontSize: 74,
              lineHeight: 1,
              color: colors.text,
              textTransform: "uppercase"
            },
            "Order on WhatsApp"
          )
        ]),
        text(
          {
            fontFamily: BODY_FONT,
            fontWeight: 700,
            fontSize: 28,
            color: colors.muted,
            marginTop: 12,
            marginLeft: 110
          },
          qr ? "Scan the code or tap the link" : "Tap the link in our message"
        )
      ]),
      qr
        ? box(
            {
              backgroundColor: PALETTE.white,
              padding: 12,
              borderRadius: 18,
              flexShrink: 0,
              marginLeft: 24
            },
            [img(qr, { width: 180, height: 180 })]
          )
        : null
    ]
  );
}

/** Rotated starburst stamp (saving / sold count). Absolute-positioned. */
export function stamp(
  lines: { big: string; small?: string },
  options: {
    size: number;
    fill: string;
    color: string;
    rotate: number;
    position: PosterStyle;
  }
): PosterNode {
  const { size } = options;
  const bigSize = fitFont(lines.big, {
    width: size * 0.62,
    maxLines: 2,
    max: Math.round(size * 0.3),
    min: Math.round(size * 0.12)
  });
  return box(
    {
      position: "absolute",
      width: size,
      height: size,
      alignItems: "center",
      justifyContent: "center",
      transform: `rotate(${options.rotate}deg)`,
      ...options.position
    },
    [
      img(svgDataUri(starburstSvg(options.fill, options.color)), {
        position: "absolute",
        top: 0,
        left: 0,
        width: size,
        height: size
      }),
      box(
        {
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: size * 0.66
        },
        [
          displayText(lines.big, bigSize, options.color, { textAlign: "center" }, {
            textAlign: "center",
            lineHeight: 0.95
          }),
          lines.small
            ? displayText(
                lines.small,
                Math.round(size * 0.085),
                options.color,
                { marginTop: Math.round(size * 0.03), textAlign: "center" },
                { textAlign: "center", letterSpacing: 1 }
              )
            : null
        ]
      )
    ]
  );
}

/** Circular photo with a solid ring. */
export function photoCircle(
  photo: string,
  size: number,
  ring: string,
  position: PosterStyle,
  ringWidth = 18
): PosterNode {
  return box(
    {
      position: "absolute",
      width: size,
      height: size,
      borderRadius: 999,
      backgroundColor: ring,
      alignItems: "center",
      justifyContent: "center",
      ...position
    },
    [
      img(photo, {
        width: size - ringWidth * 2,
        height: size - ringWidth * 2,
        borderRadius: 999,
        objectFit: "cover"
      })
    ]
  );
}

/** Arch-topped shape: a photo, or a colour fill holding children. */
export function arch(
  width: number,
  height: number,
  position: PosterStyle,
  content: { photo?: string; fill?: string; children?: (PosterNode | null)[] }
): PosterNode {
  const radius = `${width / 2}px ${width / 2}px 28px 28px`;
  return box(
    {
      position: "absolute",
      width,
      height,
      borderRadius: radius,
      overflow: "hidden",
      backgroundColor: content.fill ?? PALETTE.charcoal,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      ...position
    },
    content.photo
      ? [
          img(content.photo, {
            position: "absolute",
            top: 0,
            left: 0,
            width,
            height,
            objectFit: "cover"
          })
        ]
      : (content.children ?? [])
  );
}

/** Solid circle decoration. */
export function disc(size: number, color: string, position: PosterStyle): PosterNode {
  return box(
    { position: "absolute", width: size, height: size, borderRadius: 999, backgroundColor: color, ...position },
    []
  );
}

/** Concentric rings decoration. */
export function rings(
  size: number,
  colors: string[],
  position: PosterStyle,
  step = 0.2
): PosterNode {
  let node: PosterNode | null = null;
  for (let i = colors.length - 1; i >= 0; i--) {
    const ringSize = Math.round(size * (1 - step * i));
    node = box(
      {
        width: ringSize,
        height: ringSize,
        borderRadius: 999,
        backgroundColor: colors[i],
        alignItems: "center",
        justifyContent: "center"
      },
      node ? [node] : []
    );
  }
  return box({ position: "absolute", ...position }, node ? [node] : []);
}

/** Wide diagonal band crossing the canvas. */
export function band(
  color: string,
  options: { top: number; height: number; rotate: number; left?: number; width?: number },
  children: PosterNode[] = []
): PosterNode {
  return box(
    {
      position: "absolute",
      top: options.top,
      left: options.left ?? -300,
      width: options.width ?? POSTER_WIDTH + 600,
      height: options.height,
      backgroundColor: color,
      transform: `rotate(${options.rotate}deg)`,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    },
    children
  );
}

/** Oversized, cropped lettering (item name / price) as background texture. */
export function giantLettering(
  value: string,
  options: { size: number; color: string; rotate: number; position: PosterStyle; opacity?: number }
): PosterNode {
  return box(
    {
      position: "absolute",
      transform: `rotate(${options.rotate}deg)`,
      opacity: options.opacity ?? 1,
      ...options.position
    },
    [
      // Never wraps: it is texture, cropped by the canvas edge.
      displayText(value, options.size, options.color, { maxWidth: 6000 }, {
        lineHeight: 0.86,
        whiteSpace: "nowrap"
      })
    ]
  );
}

/** Repeating dot texture over the canvas (or a horizontal strip of it). */
export function dotTexture(
  color: string,
  opacity = 0.18,
  region: { top: number; height: number } = { top: 0, height: 1920 },
  spacing = 44,
  radius = 5
): PosterNode {
  return img(svgDataUri(dotGridSvg(color, opacity, spacing, radius, region.height)), {
    position: "absolute",
    top: region.top,
    left: 0,
    width: POSTER_WIDTH,
    height: region.height
  });
}

/** Root canvas: relative, clipped, flex column. */
export function canvas(background: string, children: (PosterNode | null)[]): PosterNode {
  return box(
    {
      position: "relative",
      width: "100%",
      height: "100%",
      flexDirection: "column",
      overflow: "hidden",
      backgroundColor: background
    },
    children
  );
}

/** Absolutely positioned content column. */
export function layer(position: PosterStyle, children: (PosterNode | null)[]): PosterNode {
  return box({ position: "absolute", flexDirection: "column", ...position }, children);
}

/** Price with optional struck-through regular price beside it. */
export function priceRow(
  price: string | null,
  original: string | null,
  options: { size: number; color: string; strikeColor: string; layout?: PosterStyle }
): PosterNode | null {
  if (!price) return null;
  return box(
    { flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", ...options.layout },
    [
      displayText(price, options.size, options.color, {}, { lineHeight: 0.9 }),
      original
        ? box({ marginLeft: 28, marginBottom: Math.round(options.size * 0.08), flexDirection: "column" }, [
            text(
              {
                fontFamily: BODY_FONT,
                fontWeight: 700,
                fontSize: Math.max(40, Math.round(options.size * 0.26)),
                color: options.strikeColor,
                textDecoration: "line-through"
              },
              original
            )
          ])
        : null
    ]
  );
}

/** Soft vertical gradient overlay (photo → solid colour). */
export function fade(
  rgb: string,
  options: { top?: number; bottom?: number; height: number; from: number; to: number; direction: "down" | "up" }
): PosterNode {
  const angle = options.direction === "down" ? "180deg" : "0deg";
  return box(
    {
      position: "absolute",
      left: 0,
      width: "100%",
      height: options.height,
      ...(options.top !== undefined ? { top: options.top } : {}),
      ...(options.bottom !== undefined ? { bottom: options.bottom } : {}),
      backgroundImage: `linear-gradient(${angle}, rgba(${rgb},${options.from}) 0%, rgba(${rgb},${options.to}) 100%)`
    },
    []
  );
}

/**
 * Full-bleed photo treatment: the dish fills the top of the frame with NO
 * overall dim; a short top fade for the brand plate and a soft fade from just
 * below 55% of the height into charcoal, where the type sits on solid colour.
 */
export const FULL_BLEED_PHOTO_HEIGHT = 1340;
export const FULL_BLEED_FADE_TOP = 1000;

export function fullBleedPhoto(photo: string): PosterNode[] {
  return [
    // Texture only on the solid charcoal below the photo, never over the dish.
    dotTexture(PALETTE.cream, 0.07, {
      top: FULL_BLEED_PHOTO_HEIGHT,
      height: 1920 - FULL_BLEED_PHOTO_HEIGHT
    }),
    img(photo, {
      position: "absolute",
      top: 0,
      left: 0,
      width: POSTER_WIDTH,
      height: FULL_BLEED_PHOTO_HEIGHT,
      objectFit: "cover"
    }),
    fade("28,23,20", { top: 0, height: 200, from: 0.35, to: 0, direction: "down" }),
    // Eased multi-stop fade: no visible seam where it meets solid charcoal.
    box(
      {
        position: "absolute",
        left: 0,
        top: FULL_BLEED_FADE_TOP,
        width: "100%",
        height: FULL_BLEED_PHOTO_HEIGHT - FULL_BLEED_FADE_TOP,
        backgroundImage:
          "linear-gradient(180deg, rgba(28,23,20,0) 0%, rgba(28,23,20,0.35) 25%, rgba(28,23,20,0.72) 52%, rgba(28,23,20,0.92) 76%, rgba(28,23,20,1) 100%)"
      },
      []
    )
  ];
}
