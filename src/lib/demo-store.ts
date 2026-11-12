import type { DraftMenuItem } from "@/lib/menu-extraction/extract";

// Instant demo stores (self-serve funnel): pure helpers shared by the /try
// server action, the demo cleanup cron, the client builder, and their tests.
// Keep this file free of Next.js and Node-builtin imports — it is bundled
// into the /try client component.

export const DEMO_SLUG_PREFIX = "demo-";
export const DEMO_LIFETIME_DAYS = 7;
// Enough for a typical café menu (3-6 printed pages). The client keeps the
// whole upload under DEMO_MAX_TOTAL_BASE64 so the request stays below the
// 11 MB server-action body limit in next.config.ts.
export const DEMO_MAX_PAGES = 8;
export const DEMO_MAX_ITEMS = 250;
export const DEMO_MAX_TOTAL_BASE64 = 9_500_000;
// Gemini calls in flight at once while reading a multi-page menu.
export const DEMO_EXTRACTION_CONCURRENCY = 4;
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

// ---- Review step -----------------------------------------------------------

export const DEMO_MAX_PRICE = 10_000;

export type ReviewFlag = "low_confidence" | "zero_price" | "unusual_price";

export const reviewFlagLabels: Record<ReviewFlag, string> = {
  low_confidence: "AI wasn't sure",
  zero_price: "Price is 0",
  unusual_price: "Price looks unusual"
};

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Flags the lines an owner should look at before customers do. "Unusual" is
// relative to this menu: far above or below the typical item price, which
// catches misread decimals (25 read as 250) without a currency-specific rule.
export function reviewFlagsFor(
  items: { price: number; confidence?: "high" | "low" }[]
): ReviewFlag[][] {
  const typical = median(items.map((item) => item.price).filter((price) => price > 0));

  return items.map((item) => {
    const flags: ReviewFlag[] = [];
    if (item.confidence === "low") {
      flags.push("low_confidence");
    }
    if (item.price <= 0) {
      flags.push("zero_price");
    } else if (typical > 0 && items.length >= 5 && (item.price > typical * 8 || item.price < typical / 10)) {
      flags.push("unusual_price");
    }
    return flags;
  });
}

export type DemoMenuReviewInput = {
  items: { id: string; name: string; price: number }[];
  deletedItemIds: string[];
  categories: { id: string; name: string }[];
};

export type DemoMenuReviewEdits =
  | { ok: true; edits: DemoMenuReviewInput }
  | { ok: false; error: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Validates untrusted review edits from the browser. Ownership of each id is
// enforced separately by scoping every write to the demo's restaurant_id.
export function validateDemoMenuReview(input: unknown): DemoMenuReviewEdits {
  const raw = (input && typeof input === "object" ? input : {}) as Partial<
    Record<keyof DemoMenuReviewInput, unknown>
  >;
  const items = Array.isArray(raw.items) ? raw.items : [];
  const deleted = Array.isArray(raw.deletedItemIds) ? raw.deletedItemIds : [];
  const categories = Array.isArray(raw.categories) ? raw.categories : [];

  if (items.length > DEMO_MAX_ITEMS || deleted.length > DEMO_MAX_ITEMS || categories.length > DEMO_MAX_ITEMS) {
    return { ok: false, error: "Too many changes at once." };
  }

  const cleanItems: DemoMenuReviewInput["items"] = [];
  for (const entry of items) {
    const item = (entry ?? {}) as Record<string, unknown>;
    const id = String(item.id ?? "");
    const name = String(item.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    const price = Number(item.price);
    if (!uuidPattern.test(id)) {
      return { ok: false, error: "Something went wrong. Reload and try again." };
    }
    if (!name) {
      return { ok: false, error: "Every item needs a name. Delete the item instead." };
    }
    if (!Number.isFinite(price) || price < 0 || price > DEMO_MAX_PRICE) {
      return { ok: false, error: `Check the price for “${name}”.` };
    }
    cleanItems.push({ id, name, price: Math.round(price * 100) / 100 });
  }

  const cleanDeleted = deleted.map(String);
  if (cleanDeleted.some((id) => !uuidPattern.test(id))) {
    return { ok: false, error: "Something went wrong. Reload and try again." };
  }

  const cleanCategories: DemoMenuReviewInput["categories"] = [];
  for (const entry of categories) {
    const category = (entry ?? {}) as Record<string, unknown>;
    const id = String(category.id ?? "");
    const name = String(category.name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!uuidPattern.test(id)) {
      return { ok: false, error: "Something went wrong. Reload and try again." };
    }
    if (!name) {
      return { ok: false, error: "Every category needs a name." };
    }
    cleanCategories.push({ id, name });
  }

  return {
    ok: true,
    edits: { items: cleanItems, deletedItemIds: [...new Set(cleanDeleted)], categories: cleanCategories }
  };
}

// Runs async work over a list with at most `limit` tasks in flight, keeping
// result order. Used to read menu pages without flooding the AI API.
export async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  task: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, values.length)) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await task(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
