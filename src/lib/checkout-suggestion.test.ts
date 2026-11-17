import { describe, expect, it } from "vitest";
import {
  learnSuggestions,
  pickSuggestion,
  type CheckoutSuggestions,
  type SuggestionItem
} from "@/lib/checkout-suggestion";

const item = (id: string, category: string, price: number): SuggestionItem => ({
  id,
  category_id: category,
  name: id,
  name_ar: null,
  price,
  image_url: null
});

const items: Record<string, SuggestionItem> = {
  burger: item("burger", "food", 16),
  shawarma: item("shawarma", "food", 6),
  karak: item("karak", "drinks", 2),
  juice: item("juice", "drinks", 8),
  platter: item("platter", "food", 60)
};

const order = (...ids: string[]) => ({ items: ids.map((item_id) => ({ item_id })) });

describe("learnSuggestions", () => {
  it("ranks companions by how often they are ordered together", () => {
    const learned = learnSuggestions(
      [
        order("burger", "karak"),
        order("burger", "karak"),
        order("burger", "juice"),
        order("burger", "juice"),
        order("burger", "juice"),
        order("shawarma", "karak")
      ],
      items
    );
    expect(learned.companions.burger).toEqual(["juice", "karak"]);
    // A pairing seen once is not enough.
    expect(learned.companions.shawarma).toBeUndefined();
    expect(learned.popular[0]).toBe("burger");
  });

  it("ignores items that are not eligible and duplicate lines in one order", () => {
    const learned = learnSuggestions(
      [order("burger", "unknown", "karak", "karak"), order("burger", "unknown", "karak")],
      items
    );
    expect(learned.companions.burger).toEqual(["karak"]);
    expect(learned.companions.karak).toEqual(["burger"]);
    expect(learned.popular).not.toContain("unknown");
  });

  it("tolerates empty or malformed orders", () => {
    expect(learnSuggestions([{ items: null }, { items: [] }], items)).toEqual({ companions: {}, popular: [] });
  });
});

describe("pickSuggestion", () => {
  const suggestions: CheckoutSuggestions = {
    companions: { burger: ["juice", "karak"], shawarma: ["karak"] },
    popular: ["burger", "karak", "juice"],
    items
  };

  it("suggests the top companion of the biggest line", () => {
    expect(pickSuggestion([{ item_id: "burger", quantity: 2 }], 32, suggestions)?.id).toBe("juice");
  });

  it("skips items already in the cart", () => {
    expect(
      pickSuggestion(
        [
          { item_id: "burger", quantity: 1 },
          { item_id: "juice", quantity: 1 }
        ],
        24,
        suggestions
      )?.id
    ).toBe("karak");
  });

  it("keeps the add-on small relative to the order", () => {
    const pricey: CheckoutSuggestions = { ...suggestions, companions: { karak: ["platter"] }, popular: [] };
    expect(pickSuggestion([{ item_id: "karak", quantity: 1 }], 2, pricey)).toBeNull();
  });

  it("does not suggest more of the same kind when the cart is one category", () => {
    // A drinks-only cart should not be offered another drink as a fallback.
    expect(pickSuggestion([{ item_id: "karak", quantity: 1 }], 2, { ...suggestions, companions: {}, popular: ["juice"] })).toBeNull();
  });

  it("falls back to popular items, and to nothing without data", () => {
    expect(pickSuggestion([{ item_id: "shawarma", quantity: 1 }], 6, { ...suggestions, companions: {} })?.id).toBe("karak");
    expect(pickSuggestion([{ item_id: "burger", quantity: 1 }], 16, null)).toBeNull();
    expect(pickSuggestion([], 0, suggestions)).toBeNull();
  });
});
