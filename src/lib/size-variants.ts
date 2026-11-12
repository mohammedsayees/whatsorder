// Turns AI-read size variants back into one item with a Size choice.
//
// The menu extractor splits "Karak Tea  S 2 / L 3" into "Karak Tea (Small)"
// and "Karak Tea (Large)" so each price is captured. Customers expect one
// item with a size picker, so before saving we merge those rows into
// "Karak Tea" at the cheapest price with a required single-choice Size group
// whose options carry the price difference.
//
// Conservative on purpose: only recognisable size words or amounts are
// grouped. "Burger (Chicken)" / "Burger (Beef)" stay separate items.
// Pure and client-safe (no Next.js / Node imports).

export const MAX_SIZE_CHOICES = 8;
export const SIZE_GROUP_NAME = "Size";
export const SIZE_GROUP_NAME_AR = "الحجم";

export type SizeChoice = { name: string; priceDelta: number };

const sizeWords = new Set([
  "xs",
  "s",
  "m",
  "l",
  "xl",
  "xxl",
  "small",
  "medium",
  "regular",
  "large",
  "x-large",
  "extra large",
  "jumbo",
  "family",
  "mini",
  "big",
  "half",
  "full",
  "quarter",
  "single",
  "double",
  "triple",
  "cup",
  "mug",
  "glass",
  "jug",
  "bottle",
  "can",
  "personal",
  "sharing",
  "kids",
  "short",
  "tall",
  "grande",
  "venti"
]);

// "250 ml", "1.5L", "12 oz", "6 pcs", "500g", "9 inch", "12\""
const amountPattern =
  /^\d+(?:\.\d+)?\s*(?:ml|l|ltr|litre|liter|oz|g|gm|gram|grams|kg|pc|pcs|piece|pieces|inch|inches|in|"|cm)$/i;

export function isSizeVariant(raw: string): boolean {
  const value = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return sizeWords.has(value) || amountPattern.test(value);
}

export function splitVariantName(name: string): { base: string; variant: string } | null {
  const match = name.trim().match(/^(.*\S)\s*\(([^()]{1,30})\)$/);
  if (!match) {
    return null;
  }
  const base = match[1].trim();
  const variant = match[2].trim();
  return base && variant ? { base, variant } : null;
}

export function sizeSignature(sizes: SizeChoice[]): string {
  return sizes.map((size) => `${size.name.trim().toLowerCase()}:${size.priceDelta.toFixed(2)}`).join("|");
}

type Row = { name: string; price: number; category: string };

export function groupSizeVariants<T extends Row>(rows: T[]): (T & { sizes: SizeChoice[] | null })[] {
  const plainNames = new Set<string>();
  const buckets = new Map<string, { base: string; members: { row: T; variant: string; index: number }[] }>();

  rows.forEach((row, index) => {
    const split = splitVariantName(row.name);
    const categoryKey = row.category.trim().toLowerCase();
    if (!split || !isSizeVariant(split.variant)) {
      plainNames.add(`${categoryKey}|${row.name.trim().toLowerCase()}`);
      return;
    }
    const key = `${categoryKey}|${split.base.toLowerCase()}`;
    const bucket = buckets.get(key) ?? { base: split.base, members: [] };
    bucket.members.push({ row, variant: split.variant, index });
    buckets.set(key, bucket);
  });

  // Decide which buckets become one item: 2+ distinct sizes, not colliding
  // with a plain item of the same name in the same category.
  const mergedAt = new Map<number, T & { sizes: SizeChoice[] }>();
  const absorbed = new Set<number>();

  for (const [key, bucket] of buckets) {
    const variants = new Set(bucket.members.map((member) => member.variant.toLowerCase()));
    if (
      bucket.members.length < 2 ||
      variants.size !== bucket.members.length ||
      bucket.members.length > MAX_SIZE_CHOICES ||
      plainNames.has(key)
    ) {
      continue;
    }

    const ordered = [...bucket.members].sort((a, b) => a.row.price - b.row.price || a.index - b.index);
    const basePrice = ordered[0].row.price;
    const first = bucket.members.reduce((earliest, member) => (member.index < earliest.index ? member : earliest));
    const lowConfidence = bucket.members.some(
      (member) => (member.row as { confidence?: string }).confidence === "low"
    );
    const featured = bucket.members.some((member) => (member.row as { is_featured?: boolean }).is_featured === true);

    const merged = {
      ...first.row,
      name: bucket.base,
      price: basePrice,
      ...(lowConfidence ? { confidence: "low" } : {}),
      ...(featured ? { is_featured: true } : {}),
      sizes: ordered.map((member) => ({
        name: member.variant,
        priceDelta: Math.round((member.row.price - basePrice) * 100) / 100
      }))
    } as T & { sizes: SizeChoice[] };

    mergedAt.set(first.index, merged);
    for (const member of bucket.members) {
      absorbed.add(member.index);
    }
  }

  const result: (T & { sizes: SizeChoice[] | null })[] = [];
  rows.forEach((row, index) => {
    const merged = mergedAt.get(index);
    if (merged) {
      result.push(merged);
    } else if (!absorbed.has(index)) {
      result.push({ ...row, sizes: null });
    }
  });
  return result;
}
