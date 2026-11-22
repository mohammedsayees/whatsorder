import { describe, expect, it } from "vitest";
import { optionPriceRange, resolveOptionGroupsByItem, type ResolvedOptionGroup } from "@/lib/menu-option-groups";
import type { MenuOptionCatalog } from "@/lib/types";

const catalog: MenuOptionCatalog = {
  groups: [
    {
      id: "size",
      restaurant_id: "restaurant-1",
      name: "Size",
      min_select: 1,
      max_select: 1,
      display_order: 0,
      created_at: "2026-01-01T00:00:00Z"
    },
    {
      id: "empty",
      restaurant_id: "restaurant-1",
      name: "Unavailable group",
      min_select: 0,
      max_select: null,
      display_order: 1,
      created_at: "2026-01-01T00:00:00Z"
    }
  ],
  options: [
    {
      id: "large",
      restaurant_id: "restaurant-1",
      group_id: "size",
      name: "Large",
      price_delta: 2,
      is_available: true,
      display_order: 2,
      created_at: "2026-01-01T00:00:00Z"
    },
    {
      id: "small",
      restaurant_id: "restaurant-1",
      group_id: "size",
      name: "Small",
      price_delta: 0,
      is_available: true,
      display_order: 1,
      created_at: "2026-01-01T00:00:00Z"
    },
    {
      id: "hidden",
      restaurant_id: "restaurant-1",
      group_id: "empty",
      name: "Hidden",
      price_delta: 0,
      is_available: false,
      display_order: 0,
      created_at: "2026-01-01T00:00:00Z"
    }
  ],
  links: [
    {
      id: "empty-link",
      restaurant_id: "restaurant-1",
      menu_item_id: "item-1",
      group_id: "empty",
      display_order: 0
    },
    {
      id: "size-link",
      restaurant_id: "restaurant-1",
      menu_item_id: "item-1",
      group_id: "size",
      display_order: 1
    }
  ]
};

describe("resolveOptionGroupsByItem", () => {
  it("keeps available options in display order and drops empty groups", () => {
    const result = resolveOptionGroupsByItem(catalog);

    expect(result.get("item-1")).toEqual([
      {
        group: catalog.groups[0],
        options: [catalog.options[1], catalog.options[0]]
      }
    ]);
  });

  it("returns an empty index when no catalog is supplied", () => {
    expect(resolveOptionGroupsByItem(undefined).size).toBe(0);
  });
});

describe("optionPriceRange", () => {
  const group = (id: string, min: number, max: number | null) =>
    ({ id, name: id, name_ar: null, min_select: min, max_select: max, display_order: 1 });
  const option = (id: string, groupId: string, delta: number, available = true) =>
    ({ id, group_id: groupId, name: id, name_ar: null, price_delta: delta, is_available: available, display_order: 1 });

  it("adds the cheapest required choice and flags varying prices", () => {
    const groups: ResolvedOptionGroup[] = [
      { group: group("size", 1, 1), options: [option("m", "size", 1), option("l", "size", 2)] },
      { group: group("extras", 0, 3), options: [option("saffron", "extras", 1)] }
    ];
    expect(optionPriceRange(1, groups)).toEqual({ min: 2, varies: true });
  });

  it("keeps the base price when required choices are free", () => {
    const groups: ResolvedOptionGroup[] = [
      { group: group("sugar", 1, 1), options: [option("none", "sugar", 0), option("extra", "sugar", 0)] }
    ];
    expect(optionPriceRange(5, groups)).toEqual({ min: 5, varies: false });
  });

  it("counts discounts and skips unavailable options", () => {
    const groups: ResolvedOptionGroup[] = [
      { group: group("size", 1, 1), options: [option("small", "size", -1), option("gone", "size", -3, false)] },
      { group: group("pick", 2, 2), options: [option("a", "pick", 0.5), option("b", "pick", 0.25), option("c", "pick", 3)] }
    ];
    expect(optionPriceRange(4, groups)).toEqual({ min: 3.75, varies: true });
    expect(optionPriceRange(4, [])).toEqual({ min: 4, varies: false });
  });
});
