import { describe, expect, it } from "vitest";
import {
  categoryDeleteBlockedMessage,
  isReservedCategoryName,
  itemsInActiveCategories,
  nextCategoryDisplayOrder
} from "@/lib/menu-categories";

describe("menu categories", () => {
  it("reserves the generated Best Sellers name in any spelling", () => {
    expect(isReservedCategoryName("Best Sellers")).toBe(true);
    expect(isReservedCategoryName("  best_seller ")).toBe(true);
    expect(isReservedCategoryName("best-sellers")).toBe(true);
    expect(isReservedCategoryName("Best Burgers")).toBe(false);
  });

  it("drops items whose category is hidden or missing", () => {
    const items = [
      { id: "a", category_id: "active" },
      { id: "b", category_id: "hidden" },
      { id: "c", category_id: "active" }
    ];

    expect(itemsInActiveCategories([{ id: "active" }], items).map((item) => item.id)).toEqual([
      "a",
      "c"
    ]);
  });

  it("places a category after every existing one, hidden included", () => {
    expect(nextCategoryDisplayOrder([])).toBe(1);
    expect(
      nextCategoryDisplayOrder([{ display_order: 2 }, { display_order: 7 }, { display_order: 3 }])
    ).toBe(8);
  });

  it("explains why a category with items cannot be deleted", () => {
    expect(categoryDeleteBlockedMessage(1)).toContain("1 item. Move or delete it first");
    expect(categoryDeleteBlockedMessage(4)).toContain("4 items. Move or delete them first");
  });
});
