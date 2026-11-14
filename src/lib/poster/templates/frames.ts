// lib/poster/templates/frames.ts
//
// Layout skeletons shared by every template. A frame owns the composition —
// where the visual, stamp, brand, content and call-to-action go — laid out
// separately for each format (9:16 story, 4:5 portrait, 1:1 square), never
// scaled. Templates supply only their content and stamp.
//
//   heroFrame  — dish in a ringed circle / AI cut-out on a disc (no photo:
//                oversized lettering or the template's own art)
//   archFrame  — dish in an arch / cut-out bursting out of a filled arch
//                (no photo: the arch holds the template's own content)
//   bleedFrame — dish (or AI background) fills the frame, type on the base
//                colour (no photo: diagonal bands)
//   statFrame  — a big figure is the hero, dish in a circle at the edge
//                (no photo: concentric rings)
//
// Square posters are side-by-side (text left, visual right); story and
// portrait stack the visual above the text.

import {
  aboveCta,
  arch,
  band,
  bandLettering,
  brandBlock,
  canvas,
  canvasHeight,
  contentWidth,
  ctaBlock,
  currentFormat,
  cutoutOnBackdrop,
  disc,
  fullBleedPhoto,
  giantLettering,
  layer,
  pad,
  photoCircle,
  pick,
  rgbList,
  rings,
  stamp,
  texture,
  type PosterScheme
} from "../design";
import type { PosterProps } from "../types";
import type { PosterNode } from "./node";

export type StampLines = { big: string; small?: string };
type Nodes = (PosterNode | null)[];

function stampNode(
  lines: StampLines | null | undefined,
  s: PosterScheme,
  size: number,
  rotate: number,
  position: Record<string, number>
): PosterNode | null {
  return lines ? stamp(lines, { size, fill: s.stampFill, color: s.stampText, rotate, position }) : null;
}

/** Content column width for a frame in the active format. */
function columnWidth(square: number): number {
  return currentFormat() === "square" ? square : contentWidth();
}

function cta(props: PosterProps, colors: { text: string; muted: string }): PosterNode {
  return layer({ bottom: pad(), left: pad() }, [ctaBlock(props.cta, colors)]);
}

function brand(props: PosterProps, s: PosterScheme, onPhoto = false, color = s.text): PosterNode {
  return layer({ top: pad(), left: pad() }, [
    brandBlock(
      props.branding,
      color,
      onPhoto ? { ring: s.palette.light, plate: `rgba(${rgbList(s.base)},0.78)` } : { ring: s.ring }
    )
  ]);
}

// ── hero ────────────────────────────────────────────────────────────────────

export function heroFrame(
  props: PosterProps,
  s: PosterScheme,
  input: {
    stamp: StampLines | null;
    content: (width: number) => Nodes;
    /** Replaces the default oversized lettering when there is no photo. */
    noPhotoArt?: Nodes;
  }
): PosterNode {
  const photo = props.subject.photoDataUri;
  const cutout = photo ? props.subject.cutoutDataUri ?? null : null;
  const width = columnWidth(500);
  const big = pick({
    story: { size: 1180, top: -420, right: -520 },
    portrait: { size: 900, top: -330, right: -400 },
    square: { size: 820, top: -300, right: -360 }
  });
  const circle = pick({
    story: { size: 860, top: 120, right: -120 },
    portrait: { size: 560, top: 70, right: -90 },
    square: { size: 580, top: 120, right: -110 }
  });
  const cut = pick({
    story: { top: 150, left: 300, size: 780 },
    portrait: { top: 90, left: 480, size: 500 },
    square: { top: 150, left: 520, size: 500 }
  });
  const stampAt = photo
    ? pick({
        story: { size: 340, rotate: -12, position: { top: 690, left: 40 } },
        portrait: { size: 230, rotate: -12, position: { top: 400, left: 330 } },
        square: { size: 200, rotate: -12, position: { top: 60, left: 420 } }
      })
    : pick({
        story: { size: 340, rotate: -12, position: { top: 250, right: 70 } },
        portrait: { size: 250, rotate: -12, position: { top: 150, right: 60 } },
        square: { size: 210, rotate: -12, position: { top: 600, right: 60 } }
      });
  const lettering = pick({
    story: { size: 460, first: { top: 130, left: -40 }, second: { top: 520, left: -330 } as Record<string, number> | null },
    portrait: { size: 330, first: { top: 110, left: -30 }, second: { top: 390, left: -240 } as Record<string, number> | null },
    square: { size: 280, first: { top: 150, left: 470 }, second: { top: 360, left: 600 } as Record<string, number> | null }
  });
  const title = props.subject.title;
  const art: Nodes = cutout
    ? cutoutOnBackdrop(cutout, { ...cut, backdrop: s.decoB, scale: 1.12 })
    : photo
      ? [photoCircle(photo, circle.size, s.ring, { top: circle.top, right: circle.right })]
      : (input.noPhotoArt ?? [
          giantLettering(title, { size: lettering.size, color: s.decoA, rotate: -8, position: lettering.first }),
          lettering.second
            ? giantLettering(title, { size: lettering.size, color: s.decoB, rotate: -8, position: lettering.second })
            : null
        ]);
  // Templates with their own art (stamp card, festival ornaments) don't get
  // the oversized lettering; a second disc keeps the field from going flat.
  // Never in square, where it would sit under the text column.
  const fill =
    !photo && input.noPhotoArt
      ? pick({
          story: { size: 560, top: 520, left: -300 } as { size: number; top: number; left: number } | null,
          portrait: { size: 400, top: 330, left: -230 } as { size: number; top: number; left: number } | null,
          square: null as { size: number; top: number; left: number } | null
        })
      : null;
  return canvas(
    s.bg,
    [
      disc(big.size, s.decoA, { top: big.top, right: big.right }),
      fill ? disc(fill.size, s.decoB, { top: fill.top, left: fill.left }) : null,
      // Halftone over the decorative shapes (not the dish or the text).
      texture(s.text, 0.12),
      ...art,
      stampNode(input.stamp, s, stampAt.size, stampAt.rotate, stampAt.position),
      brand(props, s),
      layer({ bottom: aboveCta(), left: pad(), width }, input.content(width)),
      cta(props, { text: s.text, muted: s.accent })
    ],
    s.accent
  );
}

// ── arch ────────────────────────────────────────────────────────────────────

export function archFrame(
  props: PosterProps,
  s: PosterScheme,
  input: {
    stamp: StampLines | null;
    content: (width: number) => Nodes;
    /** What the colour-filled arch holds when there is no photo. */
    archContent: (archWidth: number) => Nodes;
  }
): PosterNode {
  const photo = props.subject.photoDataUri;
  const cutout = photo ? props.subject.cutoutDataUri ?? null : null;
  const width = columnWidth(470);
  const a = pick({
    story: { width: 840, height: 860, top: 180, left: 120 },
    portrait: { width: 620, height: 600, top: 110, left: 230 },
    square: { width: 470, height: 660, top: 90, left: 550 }
  });
  const cut = pick({
    story: { top: 270, left: 150, size: 780 },
    portrait: { top: 170, left: 250, size: 580 },
    square: { top: 230, left: 540, size: 490 }
  });
  const d = (size: number, position: Record<string, number>) => ({ size, position });
  const discs = pick({
    story: [d(560, { top: 60, right: -190 }), d(240, { top: 800, left: -120 })],
    portrait: [d(420, { top: 30, right: -160 }), d(180, { top: 560, left: -90 })],
    square: [d(380, { top: -80, right: -140 }), d(150, { top: 30, left: 420 })]
  });
  const stampAt = pick({
    story: { size: 330, position: { top: 150, right: 40 } },
    portrait: { size: 250, position: { top: 80, right: 50 } },
    square: { size: 210, position: { top: 50, right: 40 } }
  });
  const archNode = cutout
    ? arch(a.width, a.height, { top: a.top, left: a.left }, { fill: s.decoA, children: [] })
    : photo
      ? arch(a.width, a.height, { top: a.top, left: a.left }, { photo })
      : arch(a.width, a.height, { top: a.top, left: a.left }, { fill: s.decoA, children: input.archContent(a.width) });
  const [d1, d2] = discs;
  return canvas(
    s.bg,
    [
      disc(d1.size, s.decoB, d1.position),
      disc(d2.size, s.decoA, d2.position),
      texture(s.text, 0.12),
      archNode,
      ...(cutout ? cutoutOnBackdrop(cutout, { ...cut, backdrop: s.decoA, scale: 1.1, disc: false }) : []),
      stampNode(input.stamp, s, stampAt.size, 12, stampAt.position),
      brand(props, s),
      layer({ bottom: aboveCta(), left: pad(), width }, input.content(width)),
      cta(props, { text: s.text, muted: s.accent })
    ],
    s.accent
  );
}

// ── bleed ───────────────────────────────────────────────────────────────────

export function bleedFrame(
  props: PosterProps,
  s: PosterScheme,
  input: {
    stamp: StampLines | null;
    content: (width: number, colors: { text: string; accent: string }) => Nodes;
    /** Text set in the no-photo bands (defaults to the item name). */
    bandText?: string;
  }
): PosterNode {
  const photo = props.subject.photoDataUri;
  // A photo-less item uses its cached AI background in the photo's place.
  const tall = props.subject.photoTallDataUri ?? photo ?? props.subject.backgroundDataUri ?? null;
  const text = tall ? s.onBase : s.text;
  const accent = tall ? s.accentOnBase : s.accent;
  const width = columnWidth(tall ? 440 : 500);
  const bands = pick({
    story: { first: { top: 250, height: 430 }, second: { top: 720, height: 64 }, third: { top: 810, height: 26 }, letters: 300 },
    portrait: { first: { top: 170, height: 320 }, second: { top: 520, height: 48 }, third: { top: 590, height: 20 }, letters: 220 },
    square: { first: { top: 120, height: 230 }, second: { top: 380, height: 36 }, third: { top: 432, height: 14 }, letters: 170 }
  });
  // Square: a flatter angle keeps the bands clear of the text column.
  const angle = pick({ story: -12, portrait: -12, square: -8 });
  const stampAt = tall
    ? pick({
        story: { size: 330, position: { top: 860, right: 48 } },
        portrait: { size: 240, position: { top: 540, right: 40 } },
        square: { size: 220, position: { top: 90, right: 60 } }
      })
    : pick({
        story: { size: 330, position: { top: 700, right: 60 } },
        portrait: { size: 240, position: { top: 470, right: 50 } },
        square: { size: 210, position: { top: 400, right: 60 } }
      });
  const decoration: Nodes = tall
    ? fullBleedPhoto(tall, s)
    : [
        texture(s.text, 0.08),
        band(s.decoA, { ...bands.first, rotate: angle }, [
          bandLettering(input.bandText ?? props.subject.title, bands.letters, { fill: s.onDecoA, stroke: s.decoA })
        ]),
        band(s.decoB, { ...bands.second, rotate: angle }),
        band(s.palette.primaryDeep, { ...bands.third, rotate: angle })
      ];
  return canvas(
    tall ? s.base : s.bg,
    [
      ...decoration,
      stampNode(input.stamp, s, stampAt.size, 10, stampAt.position),
      brand(props, s, Boolean(tall), text),
      layer({ bottom: aboveCta(), left: pad(), width }, input.content(width, { text, accent })),
      cta(props, { text, muted: accent })
    ],
    accent
  );
}

// ── stat ────────────────────────────────────────────────────────────────────

export function statFrame(
  props: PosterProps,
  s: PosterScheme,
  input: {
    stamp: StampLines | null;
    top: (width: number) => Nodes;
    lower: (width: number) => Nodes;
    /** Replaces the default rings when there is no photo. */
    noPhotoArt?: Nodes;
  }
): PosterNode {
  const photo = props.subject.photoDataUri;
  const side = pick({
    story: { circle: { size: 620, top: 1010, right: -210 }, rings: { size: 680, top: 980, right: -250 } },
    portrait: { circle: { size: 440, top: 690, right: -150 }, rings: { size: 500, top: 660, right: -180 } },
    square: { circle: { size: 440, top: 470, right: -120 }, rings: { size: 480, top: 450, right: -140 } }
  });
  const topWidth = pick({ story: contentWidth(), portrait: contentWidth(), square: 640 });
  const lowerWidth = pick({ story: 560, portrait: 600, square: 470 });
  const topAt = pick({ story: 230, portrait: 180, square: 180 });
  const stampAt = pick({
    story: { size: 320, position: { top: 250, right: 50 } },
    portrait: { size: 240, position: { top: 150, right: 50 } },
    square: { size: 210, position: { top: 110, right: 50 } }
  });
  return canvas(
    s.bg,
    [
      texture(s.text, 0.12),
      photo
        ? photoCircle(photo, side.circle.size, s.decoB, { top: side.circle.top, right: side.circle.right }, 20)
        : null,
      ...(photo
        ? []
        : (input.noPhotoArt ?? [
            rings(side.rings.size, [s.decoB, s.decoA, s.decoB, s.bg], { top: side.rings.top, right: side.rings.right }, 0.18)
          ])),
      stampNode(input.stamp, s, stampAt.size, 14, stampAt.position),
      brand(props, s),
      layer({ top: topAt, left: pad(), width: topWidth }, input.top(topWidth)),
      layer({ bottom: aboveCta(), left: pad(), width: lowerWidth }, input.lower(lowerWidth)),
      cta(props, { text: s.text, muted: s.accent })
    ],
    s.accent
  );
}

/** Height left for a stat frame's top block before the lower block (approx). */
export function statTopBudget(): number {
  return canvasHeight() - aboveCta() - pick({ story: 640, portrait: 420, square: 360 });
}
