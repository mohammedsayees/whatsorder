import { describe, expect, it } from "vitest";
import {
  buildPrintableCataloguePages,
  buildPrintableMenuSections,
  buildPrintableVariantPrices
} from "@/lib/menu-print";
import type { MenuCategory, MenuItem, MenuOptionCatalog } from "@/lib/types";

const categories: MenuCategory[] = [
  {
    id: "drinks",
    restaurant_id: "restaurant-1",
    name: "Drinks",
    display_order: 2,
    is_active: true,
    created_at: "2026-01-01"
  },
  {
    id: "food",
    restaurant_id: "restaurant-1",
    name: "Food",
    display_order: 1,
    is_active: true,
    created_at: "2026-01-01"
  }
];

const items: MenuItem[] = [
  {
    id: "tea",
    restaurant_id: "restaurant-1",
    category_id: "drinks",
    name: "Karak tea",
    description: null,
    price: 2,
    image_url: null,
    is_available: true,
    is_featured: true,
    created_at: "2026-01-01"
  },
  {
    id: "burger",
    restaurant_id: "restaurant-1",
    category_id: "food",
    name: "Burger",
    description: null,
    price: 12,
    image_url: null,
    is_available: false,
    is_featured: false,
    created_at: "2026-01-01"
  },
  {
    id: "foreign-item",
    restaurant_id: "restaurant-2",
    category_id: "drinks",
    name: "Must not appear",
    description: null,
    price: 99,
    image_url: null,
    is_available: true,
    is_featured: false,
    created_at: "2026-01-01"
  }
];

describe("buildPrintableMenuSections", () => {
  it("sorts categories and omits unavailable and cross-tenant items", () => {
    const sections = buildPrintableMenuSections(categories, items, false);

    expect(sections.map((section) => section.category.name)).toEqual(["Drinks"]);
    expect(sections[0]?.items.map((item) => item.name)).toEqual(["Karak tea"]);
  });

  it("can include unavailable items", () => {
    const sections = buildPrintableMenuSections(categories, items, true);

    expect(sections.map((section) => section.category.name)).toEqual(["Food", "Drinks"]);
  });
});

describe("buildPrintableCataloguePages", () => {
  it("creates deterministic category pages without mixing categories", () => {
    const foodItems = Array.from({ length: 7 }, (_, index) => ({
      ...items[0],
      id: `food-${index}`,
      category_id: "food",
      name: `Food ${index + 1}`
    }));
    const drinkItems = Array.from({ length: 2 }, (_, index) => ({
      ...items[0],
      id: `drink-${index}`,
      name: `Drink ${index + 1}`
    }));
    const sections = buildPrintableMenuSections(
      categories,
      [...foodItems, ...drinkItems],
      false
    );

    const pages = buildPrintableCataloguePages(sections, 6);

    expect(pages.map((page) => page.category.name)).toEqual([
      "Food",
      "Food",
      "Drinks"
    ]);
    expect(pages.map((page) => page.items.length)).toEqual([6, 1, 2]);
    expect(pages.map((page) => [page.categoryPage, page.categoryPageCount])).toEqual([
      [1, 2],
      [2, 2],
      [1, 1]
    ]);
  });

  it("rejects an invalid page capacity", () => {
    expect(() => buildPrintableCataloguePages([], 0)).toThrow(RangeError);
  });

  it("uses a selected hero first and switches continuation pages to the grid", () => {
    const featuredItems = Array.from({ length: 8 }, (_, index) => ({
      ...items[0],
      id: `item-${index}`,
      category_id: "food",
      name: `Item ${index + 1}`,
      image_url: `https://example.com/item-${index}.jpg`,
      is_featured: index === 4
    }));
    const sections = buildPrintableMenuSections(categories, featuredItems, false);

    const pages = buildPrintableCataloguePages(sections, {
      paperSize: "a4",
      defaultLayout: "hero",
      heroItemIds: { food: "item-6" }
    });

    expect(pages.map((page) => page.layout)).toEqual(["hero", "grid"]);
    expect(pages.map((page) => page.items.length)).toEqual([5, 3]);
    expect(pages[0]?.items[0]?.id).toBe("item-6");
  });

  it("automatically chooses a beverage layout from the category name", () => {
    const sections = buildPrintableMenuSections(categories, items, false);

    const pages = buildPrintableCataloguePages(sections, {
      paperSize: "a4",
      defaultLayout: "auto"
    });

    expect(pages[0]?.layout).toBe("beverage");
  });
});

describe("buildPrintableVariantPrices", () => {
  it("turns an attached size group into absolute printable prices", () => {
    const catalog: MenuOptionCatalog = {
      groups: [{
        id: "size",
        restaurant_id: "restaurant-1",
        name: "Size",
        min_select: 1,
        max_select: 1,
        display_order: 0,
        created_at: "2026-01-01"
      }],
      options: [
        {
          id: "small",
          restaurant_id: "restaurant-1",
          group_id: "size",
          name: "Small",
          price_delta: 0,
          is_available: true,
          display_order: 0,
          created_at: "2026-01-01"
        },
        {
          id: "large",
          restaurant_id: "restaurant-1",
          group_id: "size",
          name: "Large",
          price_delta: 2,
          is_available: true,
          display_order: 1,
          created_at: "2026-01-01"
        }
      ],
      links: [{
        id: "link",
        restaurant_id: "restaurant-1",
        menu_item_id: "tea",
        group_id: "size",
        display_order: 0
      }]
    };

    expect(buildPrintableVariantPrices(items, catalog).get("tea")).toEqual([
      { label: "Small", labelAr: null, price: 2 },
      { label: "Large", labelAr: null, price: 4 }
    ]);
  });

  it("does not print add-on groups as size prices", () => {
    const catalog: MenuOptionCatalog = {
      groups: [{
        id: "extras",
        restaurant_id: "restaurant-1",
        name: "Extras",
        min_select: 0,
        max_select: 2,
        display_order: 0,
        created_at: "2026-01-01"
      }],
      options: [],
      links: []
    };

    expect(buildPrintableVariantPrices(items, catalog).size).toBe(0);
  });
});
