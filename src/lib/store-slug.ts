// Public store links (/r/<slug>). Pure helpers shared by the claim flow, the
// settings slug editor, and their tests. Keep this file free of Next.js and
// Node-builtin imports so client components can use it for live previews.
//
// The SQL side (claim_demo_restaurant) enforces the same format with
// STORE_SLUG_PATTERN's regex, so a slug that passes here passes there.

export const STORE_SLUG_MIN_LENGTH = 3;
export const STORE_SLUG_MAX_LENGTH = 40;

// 3-40 chars, lowercase letters/digits/hyphens, no leading/trailing hyphen.
export const STORE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

// Words that read as product surfaces rather than a restaurant, or that would
// look like a WhatsOrder-owned page on a customer's phone.
const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "demo",
  "help",
  "login",
  "menu",
  "new",
  "order",
  "orders",
  "restaurant",
  "super-admin",
  "support",
  "test",
  "try",
  "whatsorder",
  "www"
]);

export function normalizeStoreSlug(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, STORE_SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

export function storeSlugError(slug: string): string | null {
  if (slug.length < STORE_SLUG_MIN_LENGTH) {
    return `Use at least ${STORE_SLUG_MIN_LENGTH} letters or numbers for your store link.`;
  }
  if (slug.length > STORE_SLUG_MAX_LENGTH || !STORE_SLUG_PATTERN.test(slug)) {
    return "Use only lowercase letters, numbers and single hyphens in your store link.";
  }
  if (slug.includes("--")) {
    return "Use single hyphens between words in your store link.";
  }
  if (slug.startsWith("demo-") || RESERVED_SLUGS.has(slug)) {
    return "That store link is reserved. Try your restaurant's name.";
  }
  return null;
}

// Best-effort suggestion for a claim form: the restaurant name, else the demo
// slug without its "demo-" prefix and random suffix.
export function suggestStoreSlug(restaurantName: string, currentSlug = ""): string {
  const fromName = normalizeStoreSlug(restaurantName);
  if (!storeSlugError(fromName)) {
    return fromName;
  }

  const fromSlug = normalizeStoreSlug(
    currentSlug.replace(/^demo-/, "").replace(/-[a-z0-9]{4}$/, "")
  );
  if (!storeSlugError(fromSlug)) {
    return fromSlug;
  }

  return "";
}
