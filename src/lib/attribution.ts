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
