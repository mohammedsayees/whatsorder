import { describe, expect, it } from "vitest";

import {
  DEMO_MAX_ITEMS,
  buildDemoSlug,
  dedupeDraftItems,
  demoExpiryDate,
  slugifyDemoName,
  validateDemoRestaurantName
} from "./demo-store";
import type { DraftMenuItem } from "./menu-extraction/extract";

function draft(overrides: Partial<DraftMenuItem>): DraftMenuItem {
  return {
    category: "Menu",
    name: "Karak Tea",
    name_ar: null,
    description: null,
    price: 2,
    is_featured: false,
    confidence: "high",
    ...overrides
  };
}

describe("slugifyDemoName", () => {
  it("lowercases, strips punctuation, and collapses separators", () => {
    expect(slugifyDemoName("Al Noor Café & Grill!")).toBe("al-noor-cafe-grill");
  });

  it("returns empty string for fully non-latin names", () => {
    expect(slugifyDemoName("مطعم")).toBe("");
  });
});

describe("buildDemoSlug", () => {
  it("prefixes demo- and appends the random suffix", () => {
    expect(buildDemoSlug("Chai Point", "ab12")).toBe("demo-chai-point-ab12");
  });

  it("falls back to a generic base when the name has no latin characters", () => {
    expect(buildDemoSlug("مطعم", "xy99")).toBe("demo-restaurant-xy99");
  });
});

describe("validateDemoRestaurantName", () => {
  it("trims and collapses whitespace", () => {
    expect(validateDemoRestaurantName("  Al   Noor  ")).toBe("Al Noor");
  });

  it("rejects names shorter than 2 characters", () => {
    expect(validateDemoRestaurantName(" a ")).toBeNull();
  });
});

describe("demoExpiryDate", () => {
  it("is 7 days after the reference date", () => {
    const from = new Date("2026-07-16T00:00:00Z");
    expect(demoExpiryDate(from).toISOString()).toBe("2026-07-23T00:00:00.000Z");
  });
});

describe("dedupeDraftItems", () => {
  it("drops duplicate names case-insensitively, keeping the first", () => {
    const items = dedupeDraftItems([
      draft({ name: "Karak Tea", price: 2 }),
      draft({ name: "karak tea", price: 3 }),
      draft({ name: "Zinger Burger", price: 15 })
    ]);
    expect(items.map((item) => item.name)).toEqual(["Karak Tea", "Zinger Burger"]);
    expect(items[0].price).toBe(2);
  });

  it("drops unnamed and unpriced rows", () => {
    const items = dedupeDraftItems([
      draft({ name: "  " }),
      draft({ name: "Free Water", price: Number.NaN }),
      draft({ name: "Negative", price: -1 }),
      draft({ name: "Valid", price: 0 })
    ]);
    expect(items.map((item) => item.name)).toEqual(["Valid"]);
  });

  it("caps the list at DEMO_MAX_ITEMS", () => {
    const many = Array.from({ length: DEMO_MAX_ITEMS + 20 }, (_, index) =>
      draft({ name: `Item ${index}`, price: 1 })
    );
    expect(dedupeDraftItems(many)).toHaveLength(DEMO_MAX_ITEMS);
  });
});
