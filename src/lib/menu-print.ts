import type { MenuCategory, MenuItem } from "@/lib/types";

export type PrintableMenuSection = {
  category: MenuCategory;
  items: MenuItem[];
};

export type PrintableCataloguePage = PrintableMenuSection & {
  categoryPage: number;
  categoryPageCount: number;
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

export function buildPrintableCataloguePages(
  sections: PrintableMenuSection[],
  itemsPerPage: number
): PrintableCataloguePage[] {
  if (!Number.isInteger(itemsPerPage) || itemsPerPage < 1) {
    throw new RangeError("itemsPerPage must be a positive integer");
  }

  return sections.flatMap((section) => {
    const categoryPageCount = Math.ceil(section.items.length / itemsPerPage);

    return Array.from({ length: categoryPageCount }, (_, pageIndex) => ({
      category: section.category,
      items: section.items.slice(
        pageIndex * itemsPerPage,
        (pageIndex + 1) * itemsPerPage
      ),
      categoryPage: pageIndex + 1,
      categoryPageCount
    }));
  });
}
