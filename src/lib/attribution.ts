// lib/attribution.ts
//
// Order attribution source (`?src=` on a store link, e.g. poster-<uuid>).
// Pure and dependency-free: used by the customer checkout page and action, so
// it must stay tiny.

const SOURCE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Lower-cased, validated source token, or null for anything else. */
export function sanitizeAttributionSource(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const candidate = value.trim().toLowerCase();
  return SOURCE_PATTERN.test(candidate) ? candidate : null;
}

export function posterAttributionSource(posterId: string): string {
  return `poster-${posterId.toLowerCase()}`;
}

/** Sources stamped on the admin "Share your store" kit, one per channel. */
export const STORE_SHARE_SOURCES = {
  link: "share-link",
  qr: "share-qr",
  whatsapp: "share-whatsapp",
  printedMenu: "printed-menu"
} as const;

/** `url` with `?src=<source>` set (replacing any existing src). */
export function withAttributionSource(url: string, source: string): string {
  const safe = sanitizeAttributionSource(source);
  if (!safe) {
    return url;
  }
  const [base, query = ""] = url.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("src", safe);
  return `${base}?${params.toString()}`;
}
