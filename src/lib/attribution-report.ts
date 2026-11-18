// lib/attribution-report.ts
//
// Pure grouping/labelling for attribution reports (admin share page and the
// super-admin signup breakdown). Admin-only: never import from the customer path.

import { STORE_SHARE_SOURCES } from "./attribution";

export const UNTAGGED_SOURCE = "untagged";

const knownLabels: Record<string, string> = {
  [STORE_SHARE_SOURCES.link]: "Copied store link",
  [STORE_SHARE_SOURCES.qr]: "QR code (download / counter card)",
  [STORE_SHARE_SOURCES.whatsapp]: "Shared on WhatsApp",
  [STORE_SHARE_SOURCES.printedMenu]: "Printed menu QR",
  [UNTAGGED_SOURCE]: "Untagged (old links, direct visits)",
  home: "WhatsOrder homepage",
  demo: "Demo store banner"
};

/** Groups every poster-<id> source under one "posters" bucket. */
export function attributionBucket(source: string | null | undefined): string {
  if (!source) {
    return UNTAGGED_SOURCE;
  }
  return source.startsWith("poster-") ? "posters" : source;
}

export function attributionLabel(bucket: string): string {
  if (bucket === "posters") {
    return "Poster Studio posters";
  }
  return knownLabels[bucket] ?? bucket;
}

export type AttributionRow = { bucket: string; label: string; count: number };

/** Counts rows per bucket, largest first; untagged always sorts last. */
export function summarizeAttribution(
  sources: Array<string | null | undefined>
): AttributionRow[] {
  const counts = new Map<string, number>();
  for (const source of sources) {
    const bucket = attributionBucket(source);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([bucket, count]) => ({ bucket, label: attributionLabel(bucket), count }))
    .sort((a, b) => {
      if (a.bucket === UNTAGGED_SOURCE) return 1;
      if (b.bucket === UNTAGGED_SOURCE) return -1;
      return b.count - a.count || a.bucket.localeCompare(b.bucket);
    });
}

export type SignupSourceRow = {
  bucket: string;
  label: string;
  demos: number;
  claimed: number;
};

/** Demo builds and claims per signup source (claimed = no longer a demo). */
export function summarizeSignupSources(
  restaurants: Array<{ signup_source: string | null; is_demo: boolean | null }>
): SignupSourceRow[] {
  const rows = new Map<string, SignupSourceRow>();
  for (const restaurant of restaurants) {
    const bucket = restaurant.signup_source ?? UNTAGGED_SOURCE;
    const row =
      rows.get(bucket) ??
      { bucket, label: knownLabels[bucket] ?? bucket, demos: 0, claimed: 0 };
    row.demos += 1;
    if (!restaurant.is_demo) {
      row.claimed += 1;
    }
    rows.set(bucket, row);
  }
  return [...rows.values()].sort((a, b) => {
    if (a.bucket === UNTAGGED_SOURCE) return 1;
    if (b.bucket === UNTAGGED_SOURCE) return -1;
    return b.demos - a.demos || a.bucket.localeCompare(b.bucket);
  });
}
