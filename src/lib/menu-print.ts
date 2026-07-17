import type { MenuCategory, MenuItem } from "@/lib/types";

export type PrintableMenuSection = {
  category: MenuCategory;
  items: MenuItem[];
};

export function buildPrintableMenuSections(
  categories: MenuCategory[],
  items: MenuItem[],
  includeUnavailable: boolean
): PrintableMenuSection[] {
  return [...categories]
    .filter((category) => category.is_active)
    .sort((first, second) => first.display_order - second.display_order)
    .map((category) => ({
      category,
      items: items.filter(
        (item) =>
          item.restaurant_id === category.restaurant_id &&
          item.category_id === category.id &&
          (includeUnavailable || item.is_available)
      )
    }))
    .filter((section) => section.items.length > 0);
}
