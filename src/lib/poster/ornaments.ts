// lib/poster/ornaments.ts
//
// Code-drawn artwork for the loyalty and festival templates (SVG data URIs,
// rendered by resvg). Purely decorative: no words or numbers are drawn here
// except the stamp card's stamp count, which comes from tenant data.

import type { FestivalOrnament } from "./festivals";
import { img, type PosterNode, type PosterStyle } from "./templates/node";

function svgUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function placed(svg: string, width: number, height: number, position: PosterStyle): PosterNode {
  return img(svgUri(svg), { position: "absolute", width, height, ...position });
}

/**
 * A loyalty stamp card: `stamps` circles in a grid, the first two stamped,
 * the last one marked as the reward (a star).
 */
export function stampCard(
  stamps: number,
  colors: { card: string; ink: string; accent: string },
  size: { width: number; height: number },
  position: PosterStyle
): PosterNode {
  const count = Math.max(1, Math.min(20, Math.round(stamps)));
  const cols = count <= 5 ? count : count <= 10 ? 5 : Math.ceil(count / 4);
  const rows = Math.ceil(count / cols);
  const w = 1000;
  const h = Math.round((w * size.height) / size.width);
  const padX = 80;
  const padY = 90;
  const cell = Math.min((w - padX * 2) / cols, (h - padY * 2) / rows);
  const r = cell * 0.36;
  const gridW = cell * cols;
  const gridH = cell * rows;
  const x0 = (w - gridW) / 2 + cell / 2;
  const y0 = (h - gridH) / 2 + cell / 2;
  const star = (cx: number, cy: number, radius: number) => {
    const points: string[] = [];
    for (let i = 0; i < 10; i++) {
      const rad = i % 2 === 0 ? radius : radius * 0.45;
      const angle = (Math.PI * i) / 5 - Math.PI / 2;
      points.push(`${(cx + rad * Math.cos(angle)).toFixed(1)},${(cy + rad * Math.sin(angle)).toFixed(1)}`);
    }
    return `<polygon points="${points.join(" ")}" fill="${colors.card}"/>`;
  };
  const cells: string[] = [];
  for (let i = 0; i < count; i++) {
    const cx = x0 + (i % cols) * cell;
    const cy = y0 + Math.floor(i / cols) * cell;
    if (i === count - 1) {
      cells.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colors.accent}"/>${star(cx, cy, r * 0.62)}`);
    } else if (i < 2) {
      cells.push(
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colors.ink}"/><path d="M${cx - r * 0.42} ${cy} l${r * 0.3} ${r * 0.32} l${r * 0.56} -${r * 0.62}" fill="none" stroke="${colors.card}" stroke-width="${r * 0.18}" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    } else {
      cells.push(
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors.ink}" stroke-width="${r * 0.12}" stroke-dasharray="${r * 0.3} ${r * 0.18}"/>`
      );
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect x="6" y="6" width="${w - 12}" height="${h - 12}" rx="48" fill="${colors.card}" stroke="${colors.ink}" stroke-width="6"/><circle cx="6" cy="${h / 2}" r="36" fill="${colors.accent}" opacity="0"/>${cells.join("")}</svg>`;
  return placed(svg, size.width, size.height, position);
}

function crescentSvg(colours: string[]): string {
  const [gold, pale] = colours;
  const lantern = (x: number, len: number, s: number) =>
    `<line x1="${x}" y1="0" x2="${x}" y2="${len}" stroke="${gold}" stroke-width="3"/><g transform="translate(${x} ${len}) scale(${s})"><path d="M-30 0 h60 l-10 18 h-40 z" fill="${gold}"/><path d="M-26 18 h52 l8 70 l-34 22 l-34 -22 z" fill="${pale}" stroke="${gold}" stroke-width="5"/><path d="M-10 40 q10 -22 20 0 q-10 26 -20 0" fill="${gold}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><defs><mask id="m"><rect width="1000" height="1000" fill="#fff"/><circle cx="640" cy="440" r="260" fill="#000"/></mask></defs><circle cx="540" cy="520" r="300" fill="${gold}" mask="url(#m)"/><polygon points="760,300 778,352 832,352 788,384 806,436 760,404 714,436 732,384 688,352 742,352" fill="${pale}"/>${lantern(160, 220, 1.3)}${lantern(300, 120, 1)}${lantern(880, 160, 1.1)}</svg>`;
}

function stripesSvg(colours: string[], chakra = false): string {
  const bands = colours
    .map((c, i) => `<rect x="-400" y="${120 + i * 150}" width="1800" height="130" fill="${c}" stroke="rgba(0,0,0,0.12)" stroke-width="2"/>`)
    .join("");
  const wheel = chakra
    ? `<g transform="translate(500 ${120 + 150 + 65})"><circle r="52" fill="none" stroke="#0b3d91" stroke-width="7"/>${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="0" x2="${(52 * Math.cos((i * Math.PI) / 6)).toFixed(1)}" y2="${(52 * Math.sin((i * Math.PI) / 6)).toFixed(1)}" stroke="#0b3d91" stroke-width="3"/>`).join("")}</g>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"><g transform="rotate(-14 500 500)">${bands}${wheel}</g></svg>`;
}

function diyaSvg(colours: string[]): string {
  const [flame, bowl, glow] = colours;
  const diya = (x: number, y: number, s: number) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-40" r="70" fill="${glow}" opacity="0.35"/><path d="M0 -95 q28 40 0 62 q-28 -22 0 -62" fill="${flame}"/><path d="M-90 0 q90 80 180 0 z" fill="${bowl}"/><path d="M-90 0 h180" stroke="${flame}" stroke-width="8"/></g>`;
  const dots = Array.from({ length: 36 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 36;
    const ring = i % 2 === 0 ? 300 : 250;
    return `<circle cx="${(500 + ring * Math.cos(angle)).toFixed(1)}" cy="${(470 + ring * Math.sin(angle)).toFixed(1)}" r="${i % 2 === 0 ? 14 : 9}" fill="${i % 3 === 0 ? flame : glow}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">${dots}<circle cx="500" cy="470" r="150" fill="none" stroke="${glow}" stroke-width="10" stroke-dasharray="20 14"/>${diya(500, 500, 1.4)}${diya(220, 820, 1)}${diya(780, 820, 1)}</svg>`;
}

function splashSvg(colours: string[]): string {
  const blobs = Array.from({ length: 26 }, (_, i) => {
    const c = colours[i % colours.length];
    const x = (i * 173) % 1000;
    const y = (i * 271) % 1000;
    const r = 40 + ((i * 37) % 110);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity="0.85"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000">${blobs}</svg>`;
}

/** Festival ornament art for a square region. */
export function festivalOrnament(
  ornament: FestivalOrnament,
  colours: string[],
  size: number,
  position: PosterStyle
): PosterNode {
  const svg =
    ornament === "crescent"
      ? crescentSvg(colours)
      : ornament === "diya"
        ? diyaSvg(colours)
        : ornament === "colour_splash"
          ? splashSvg(colours)
          : stripesSvg(colours, ornament === "flag_stripes_in");
  return placed(svg, size, size, position);
}
