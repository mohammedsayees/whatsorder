import { describe, expect, it } from "vitest";

import {
  normalizeStoreSlug,
  STORE_SLUG_PATTERN,
  storeSlugError,
  suggestStoreSlug
} from "@/lib/store-slug";

describe("store slugs", () => {
  it("normalizes names into lowercase hyphenated links", () => {
    expect(normalizeStoreSlug("  Al Noor Cafeteria! ")).toBe("al-noor-cafeteria");
    expect(normalizeStoreSlug("Café Crème")).toBe("cafe-creme");
    expect(normalizeStoreSlug("Chai -- Xpress")).toBe("chai-xpress");
  });

  it("caps length without leaving a trailing hyphen", () => {
    const slug = normalizeStoreSlug(`${"a".repeat(39)} b`);
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("accepts ordinary restaurant links", () => {
    expect(storeSlugError("chaixpress")).toBeNull();
    expect(storeSlugError("al-noor-2")).toBeNull();
  });

  it("rejects short, malformed, demo and reserved links", () => {
    expect(storeSlugError("ab")).toMatch(/at least/);
    expect(storeSlugError("-abc")).toMatch(/lowercase/);
    expect(storeSlugError("abc-")).toMatch(/lowercase/);
    expect(storeSlugError("Abc")).toMatch(/lowercase/);
    expect(storeSlugError("ab--cd")).toMatch(/single hyphens/);
    expect(storeSlugError("demo-al-noor-k3x9")).toMatch(/reserved/);
    expect(storeSlugError("admin")).toMatch(/reserved/);
  });

  it("keeps the app pattern in step with the SQL check", () => {
    expect(STORE_SLUG_PATTERN.source).toBe("^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$");
  });

  it("suggests the name, falling back to the demo slug body", () => {
    expect(suggestStoreSlug("Al Noor", "demo-al-noor-k3x9")).toBe("al-noor");
    expect(suggestStoreSlug("مطعم", "demo-matam-k3x9")).toBe("matam");
    expect(suggestStoreSlug("مطعم", "demo-restaurant-k3x9")).toBe("");
  });
});
