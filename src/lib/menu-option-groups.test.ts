import { describe, expect, it } from "vitest";
import { resolveOptionGroupsByItem } from "@/lib/menu-option-groups";
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
