import type { MenuCategory, MenuItem } from "@/lib/types";

export const CATEGORY_NAME_MAX_LENGTH = 80;

// "Best Sellers" is generated from product tags, so it must never be a real
// category (creating or renaming one would show it twice on the menu).
export function isReservedCategoryName(name: string) {
  const normalized = name.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  return normalized === "best seller" || normalized === "best sellers";
}

// Items of a hidden category must disappear everywhere on the public menu —
// not just its heading, but also Best Sellers, offers, and server re-pricing,
// which all read the same item list.
export function itemsInActiveCategories<T extends Pick<MenuItem, "category_id">>(
  categories: Pick<MenuCategory, "id">[],
  items: T[]
) {
  const activeIds = new Set(categories.map((category) => category.id));
  return items.filter((item) => activeIds.has(item.category_id));
}

// Next free slot at the end of the menu, counting hidden categories too so a
// re-shown or new category never shares a display_order (equal values make
// the up/down swap a no-op).
export function nextCategoryDisplayOrder(categories: Pick<MenuCategory, "display_order">[]) {
  return categories.reduce((max, category) => Math.max(max, category.display_order), 0) + 1;
}

export function categoryDeleteBlockedMessage(itemCount: number) {
  return `This category still has ${itemCount} ${itemCount === 1 ? "item" : "items"}. Move or delete ${itemCount === 1 ? "it" : "them"} first, or hide the category instead.`;
}
