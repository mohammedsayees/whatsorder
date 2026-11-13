// lib/poster/bidi.ts
//
// Satori shapes Arabic glyphs (joined letter forms) but does no bidi word
// reordering: an Arabic phrase in one text node comes out in left-to-right
// word order. This module splits text into direction runs so templates can
// lay words out explicitly (see design.ts → richText). Pure and tiny.

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LATIN = /[A-Za-zÀ-ɏ]/;

export type Direction = "ltr" | "rtl";

export function hasArabic(value: string): boolean {
  return ARABIC.test(value);
}

function strongDirection(word: string): Direction | null {
  for (const char of word) {
    if (ARABIC.test(char)) return "rtl";
    if (LATIN.test(char)) return "ltr";
  }
  return null; // digits, punctuation, emoji: take the context's direction
}

/** Paragraph direction: the first strong character wins (UAX #9 P2). */
export function paragraphDirection(value: string): Direction {
  for (const word of value.split(/\s+/)) {
    const direction = strongDirection(word);
    if (direction) return direction;
  }
  return "ltr";
}

export type DirectionRun = { direction: Direction; words: string[] };

/**
 * Logical-order runs of same-direction words. Neutral words (numbers,
 * punctuation) join their neighbours' run when both sides agree, otherwise
 * the paragraph direction.
 */
export function directionRuns(value: string): {
  direction: Direction;
  runs: DirectionRun[];
} {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const paragraph = paragraphDirection(value);
  const strong = words.map(strongDirection);

  const resolved: Direction[] = strong.map((direction, index) => {
    if (direction) return direction;
    let before: Direction | null = null;
    for (let i = index - 1; i >= 0 && !before; i--) before = strong[i];
    let after: Direction | null = null;
    for (let i = index + 1; i < strong.length && !after; i++) after = strong[i];
    return before && before === after ? before : paragraph;
  });

  const runs: DirectionRun[] = [];
  words.forEach((word, index) => {
    const last = runs[runs.length - 1];
    if (last && last.direction === resolved[index]) {
      last.words.push(word);
    } else {
      runs.push({ direction: resolved[index], words: [word] });
    }
  });
  return { direction: paragraph, runs };
}

/** Left-to-right visual word order of a single line (for tests and debugging). */
export function visualWordOrder(value: string): string[] {
  const { direction, runs } = directionRuns(value);
  const ordered = runs.map((run) =>
    run.direction === "rtl" ? [...run.words].reverse() : run.words
  );
  return (direction === "rtl" ? ordered.reverse() : ordered).flat();
}
