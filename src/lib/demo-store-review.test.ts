import { describe, expect, it } from "vitest";

import {
  DEMO_MAX_ITEMS,
  mapWithConcurrency,
  reviewFlagsFor,
  validateDemoMenuReview
} from "@/lib/demo-store";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("reviewFlagsFor", () => {
  it("flags low confidence, zero prices and outliers against this menu", () => {
    const items = [
      { price: 2 },
      { price: 3 },
      { price: 4, confidence: "low" as const },
      { price: 5 },
      { price: 0 },
      { price: 250 }
    ];
    expect(reviewFlagsFor(items)).toEqual([
      [],
      [],
      ["low_confidence"],
      [],
      ["zero_price"],
      ["unusual_price"]
    ]);
  });

  it("doesn't call prices unusual on tiny menus", () => {
    expect(reviewFlagsFor([{ price: 2 }, { price: 200 }])).toEqual([[], []]);
  });
});

describe("validateDemoMenuReview", () => {
  it("cleans valid edits", () => {
    const result = validateDemoMenuReview({
      items: [{ id: id(1), name: "  Karak   Tea ", price: "2.555" }],
      deletedItemIds: [id(2), id(2)],
      categories: [{ id: id(3), name: " Hot drinks " }]
    });
    expect(result).toEqual({
      ok: true,
      edits: {
        items: [{ id: id(1), name: "Karak Tea", price: 2.56 }],
        deletedItemIds: [id(2)],
        categories: [{ id: id(3), name: "Hot drinks" }]
      }
    });
  });

  it("rejects bad ids, empty names, bad prices and oversized payloads", () => {
    expect(validateDemoMenuReview({ items: [{ id: "x", name: "a", price: 1 }] }).ok).toBe(false);
    expect(validateDemoMenuReview({ items: [{ id: id(1), name: " ", price: 1 }] }).ok).toBe(false);
    expect(validateDemoMenuReview({ items: [{ id: id(1), name: "a", price: -1 }] }).ok).toBe(false);
    expect(validateDemoMenuReview({ items: [{ id: id(1), name: "a", price: "abc" }] }).ok).toBe(false);
    expect(validateDemoMenuReview({ deletedItemIds: ["drop table"] }).ok).toBe(false);
    expect(validateDemoMenuReview({ categories: [{ id: id(1), name: "" }] }).ok).toBe(false);
    expect(
      validateDemoMenuReview({
        deletedItemIds: Array.from({ length: DEMO_MAX_ITEMS + 1 }, (_, n) => id(n))
      }).ok
    ).toBe(false);
    expect(validateDemoMenuReview(null)).toEqual({
      ok: true,
      edits: { items: [], deletedItemIds: [], categories: [] }
    });
  });
});

describe("mapWithConcurrency", () => {
  it("keeps order and never exceeds the limit", async () => {
    let running = 0;
    let peak = 0;
    const result = await mapWithConcurrency([5, 1, 4, 2, 3, 6], 2, async (value) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, value));
      running -= 1;
      return value * 10;
    });
    expect(result).toEqual([50, 10, 40, 20, 30, 60]);
    expect(peak).toBe(2);
  });
});
