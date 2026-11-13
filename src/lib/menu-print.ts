import { isSizeVariant } from "@/lib/size-variants";
import type {
  MenuCategory,
  MenuItem,
  MenuOptionCatalog
} from "@/lib/types";

export type CatalogueLayout = "grid" | "hero" | "beverage";
export type CatalogueLayoutChoice = CatalogueLayout | "auto";

export type PrintableMenuSection = {
  category: MenuCategory;
  items: MenuItem[];
};

export type PrintableCataloguePage = PrintableMenuSection & {
  categoryPage: number;
  categoryPageCount: number;
  layout: CatalogueLayout;
};

export type PrintableVariantPrice = {
  label: string;
  labelAr: string | null;
  price: number;
};

export type PrintableCatalogueOptions = {
  paperSize: "a4" | "a5";
  defaultLayout: CatalogueLayoutChoice;
  categoryLayouts?: Record<string, CatalogueLayoutChoice>;
  heroItemIds?: Record<string, string | undefined>;
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
  optionsOrItemsPerPage: PrintableCatalogueOptions | number
): PrintableCataloguePage[] {
  if (typeof optionsOrItemsPerPage === "number") {
    if (!Number.isInteger(optionsOrItemsPerPage) || optionsOrItemsPerPage < 1) {
      throw new RangeError("itemsPerPage must be a positive integer");
    }

    return sections.flatMap((section) => {
      const categoryPageCount = Math.ceil(
        section.items.length / optionsOrItemsPerPage
      );

      return Array.from({ length: categoryPageCount }, (_, pageIndex) => ({
        category: section.category,
        items: section.items.slice(
          pageIndex * optionsOrItemsPerPage,
          (pageIndex + 1) * optionsOrItemsPerPage
        ),
        categoryPage: pageIndex + 1,
        categoryPageCount,
        layout: "grid" as const
      }));
    });
  }

  const gridCapacity = optionsOrItemsPerPage.paperSize === "a4" ? 6 : 4;
  const heroCapacity = optionsOrItemsPerPage.paperSize === "a4" ? 5 : 3;
  const beverageCapacity = optionsOrItemsPerPage.paperSize === "a4" ? 6 : 4;

  return sections.flatMap((section) => {
    const selectedLayout =
      optionsOrItemsPerPage.categoryLayouts?.[section.category.id] ??
      optionsOrItemsPerPage.defaultLayout;
    const layout = resolveCatalogueLayout(section, selectedLayout);
    const heroItemId = optionsOrItemsPerPage.heroItemIds?.[section.category.id];
    const items = layout === "hero"
      ? moveHeroItemFirst(section.items, heroItemId)
      : section.items;
    const pages: Array<{ items: MenuItem[]; layout: CatalogueLayout }> = [];

    if (layout === "hero") {
      pages.push({ items: items.slice(0, heroCapacity), layout: "hero" });
      for (let index = heroCapacity; index < items.length; index += gridCapacity) {
        pages.push({ items: items.slice(index, index + gridCapacity), layout: "grid" });
      }
    } else {
      const capacity = layout === "beverage" ? beverageCapacity : gridCapacity;
      for (let index = 0; index < items.length; index += capacity) {
        pages.push({ items: items.slice(index, index + capacity), layout });
      }
    }

    return pages.map((page, pageIndex) => ({
      category: section.category,
      items: page.items,
      categoryPage: pageIndex + 1,
      categoryPageCount: pages.length,
      layout: page.layout
    }));
  });
}

export function buildPrintableVariantPrices(
  items: MenuItem[],
  catalog: MenuOptionCatalog
): Map<string, PrintableVariantPrice[]> {
  const groupsById = new Map(catalog.groups.map((group) => [group.id, group]));
  const optionsByGroupId = new Map<string, typeof catalog.options>();

  for (const option of catalog.options) {
    if (!option.is_available) continue;
    const options = optionsByGroupId.get(option.group_id) ?? [];
    options.push(option);
    optionsByGroupId.set(option.group_id, options);
  }

  const linksByItemId = new Map<string, typeof catalog.links>();
  for (const link of [...catalog.links].sort(
    (first, second) => first.display_order - second.display_order
  )) {
    const links = linksByItemId.get(link.menu_item_id) ?? [];
    links.push(link);
    linksByItemId.set(link.menu_item_id, links);
  }

  const result = new Map<string, PrintableVariantPrice[]>();
  for (const item of items) {
    for (const link of linksByItemId.get(item.id) ?? []) {
      const group = groupsById.get(link.group_id);
      const options = [...(optionsByGroupId.get(link.group_id) ?? [])].sort(
        (first, second) => first.display_order - second.display_order
      );
      if (
        !group ||
        group.restaurant_id !== item.restaurant_id ||
        group.min_select !== 1 ||
        group.max_select !== 1 ||
        options.length < 2 ||
        !isPrintableSizeGroup(group.name, options.map((option) => option.name))
      ) {
        continue;
      }

      result.set(
        item.id,
        options.slice(0, 4).map((option) => ({
          label: option.name,
          labelAr: option.name_ar ?? null,
          price: item.price + Number(option.price_delta)
        }))
      );
      break;
    }
  }

  return result;
}

function resolveCatalogueLayout(
  section: PrintableMenuSection,
  choice: CatalogueLayoutChoice
): CatalogueLayout {
  if (choice !== "auto") return choice;

  const categoryName = `${section.category.name} ${section.category.name_ar ?? ""}`;
  if (/juice|drink|beverage|shake|smoothie|mojito|coffee|tea|مشروب|عصير/i.test(categoryName)) {
    return "beverage";
  }
  if (section.items.some((item) => item.is_featured && item.image_url)) {
    return "hero";
  }
  return "grid";
}

function moveHeroItemFirst(items: MenuItem[], selectedItemId?: string): MenuItem[] {
  const heroIndex = selectedItemId
    ? items.findIndex((item) => item.id === selectedItemId)
    : items.findIndex((item) => item.is_featured && item.image_url);
  if (heroIndex <= 0) return items;

  return [items[heroIndex], ...items.slice(0, heroIndex), ...items.slice(heroIndex + 1)];
}

function isPrintableSizeGroup(groupName: string, optionNames: string[]): boolean {
  return groupName.trim().toLowerCase() === "size" || optionNames.every(isSizeVariant);
}
