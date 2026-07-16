import type { DraftMenuItem } from "@/lib/menu-extraction/extract";

// Instant demo stores (self-serve funnel): pure helpers shared by the /try
// server action, the demo cleanup cron, the client builder, and their tests.
// Keep this file free of Next.js and Node-builtin imports — it is bundled
// into the /try client component.

export const DEMO_SLUG_PREFIX = "demo-";
export const DEMO_LIFETIME_DAYS = 7;
export const DEMO_MAX_PAGES = 2;
export const DEMO_MAX_ITEMS = 120;
export const DEMO_BUILDS_PER_DAY = 3;

export const FOUNDER_WHATSAPP_NUMBER =
  process.env.NEXT_PUBLIC_DEMO_WHATSAPP_NUMBER ?? "971551150068";

export function slugifyDemoName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function buildDemoSlug(restaurantName: string, random?: string): string {
  const base = slugifyDemoName(restaurantName) || "restaurant";
  const suffix = (random ?? Math.random().toString(36).slice(2, 6)).toLowerCase();
  return `${DEMO_SLUG_PREFIX}${base}-${suffix}`;
}

export function demoExpiryDate(from = new Date()): Date {
  return new Date(from.getTime() + DEMO_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
}

export function validateDemoRestaurantName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ").slice(0, 60);
  return name.length >= 2 ? name : null;
}

// The extractor can return duplicates across pages (menus repeat best-sellers)
// and unpriced decorative rows. Keep the first occurrence of each name.
export function dedupeDraftItems(items: DraftMenuItem[]): DraftMenuItem[] {
  const seen = new Set<string>();
  const result: DraftMenuItem[] = [];

  for (const item of items) {
    const name = String(item.name ?? "").trim();
    const price = Number(item.price);
    if (!name || !Number.isFinite(price) || price < 0) {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push({ ...item, name });
    if (result.length >= DEMO_MAX_ITEMS) {
      break;
    }
  }

  return result;
}
