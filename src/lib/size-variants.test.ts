import { describe, expect, it } from "vitest";

import { groupSizeVariants, isSizeVariant, sizeSignature, splitVariantName } from "@/lib/size-variants";

const row = (name: string, price: number, extra: Record<string, unknown> = {}) => ({
  name,
  price,
  category: "Hot Drinks",
  ...extra
});

describe("size variants", () => {
  it("recognises size words and amounts, not flavours", () => {
    for (const value of ["Small", "LARGE", "Half", "250 ml", "1.5L", "12 oz", "6 pcs", "9 inch"]) {
      expect(isSizeVariant(value)).toBe(true);
    }
    for (const value of ["Chicken", "Beef", "Spicy", "Mango"]) {
      expect(isSizeVariant(value)).toBe(false);
    }
  });

  it("splits a trailing bracketed variant", () => {
    expect(splitVariantName("Karak Tea (Large)")).toEqual({ base: "Karak Tea", variant: "Large" });
    expect(splitVariantName("Karak Tea")).toBeNull();
  });

  it("merges sizes into one item at the lowest price with price differences", () => {
    const result = groupSizeVariants([
      row("Karak Tea (Large)", 3, { confidence: "low" }),
      row("Samosa", 1),
      row("Karak Tea (Small)", 2)
    ]);
    expect(result).toEqual([
      {
        name: "Karak Tea",
        price: 2,
        category: "Hot Drinks",
        confidence: "low",
        sizes: [
          { name: "Small", priceDelta: 0 },
          { name: "Large", priceDelta: 1 }
        ]
      },
      { ...row("Samosa", 1), sizes: null }
    ]);
  });

  it("leaves flavours, singletons, duplicates and name clashes alone", () => {
    const flavours = groupSizeVariants([row("Burger (Chicken)", 15), row("Burger (Beef)", 18)]);
    expect(flavours.every((item) => item.sizes === null)).toBe(true);

    expect(groupSizeVariants([row("Tea (Small)", 1)])[0].sizes).toBeNull();
    expect(
      groupSizeVariants([row("Tea (Small)", 1), row("Tea (small)", 2)]).every((item) => item.sizes === null)
    ).toBe(true);
    expect(
      groupSizeVariants([row("Tea", 1), row("Tea (Small)", 1), row("Tea (Large)", 2)]).every(
        (item) => item.sizes === null
      )
    ).toBe(true);
  });

  it("only groups within one category", () => {
    const result = groupSizeVariants([
      row("Juice (Small)", 5),
      { ...row("Juice (Large)", 8), category: "Cold Drinks" }
    ]);
    expect(result.every((item) => item.sizes === null)).toBe(true);
  });

  it("gives identical size sets the same signature", () => {
    expect(sizeSignature([{ name: "Small", priceDelta: 0 }, { name: "Large", priceDelta: 1 }])).toBe(
      sizeSignature([{ name: "small", priceDelta: 0 }, { name: "Large", priceDelta: 1.0 }])
    );
  });
});
