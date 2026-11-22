import type {
  CustomerMenuOption,
  CustomerMenuOptionCatalog,
  CustomerMenuOptionGroup
} from "@/lib/types";

export type ResolvedOptionGroup = {
  group: CustomerMenuOptionGroup;
  options: CustomerMenuOption[];
};

/**
 * Groups attached to each item in link order, keeping only available options
 * and dropping groups with none. Shared by customer and staff order entry.
 */
export function resolveOptionGroupsByItem(
  catalog: CustomerMenuOptionCatalog | undefined
): Map<string, ResolvedOptionGroup[]> {
  const map = new Map<string, ResolvedOptionGroup[]>();

  if (!catalog) {
    return map;
  }

  const groupsById = new Map(catalog.groups.map((group) => [group.id, group]));
  const optionsByGroupId = new Map<string, CustomerMenuOption[]>();

  for (const option of [...catalog.options].sort(
    (first, second) => first.display_order - second.display_order
  )) {
    if (!option.is_available) {
      continue;
    }

    const list = optionsByGroupId.get(option.group_id) ?? [];
    list.push(option);
    optionsByGroupId.set(option.group_id, list);
  }

  for (const link of [...catalog.links].sort(
    (first, second) => first.display_order - second.display_order
  )) {
    const group = groupsById.get(link.group_id);
    const groupOptions = optionsByGroupId.get(link.group_id) ?? [];

    if (!group || groupOptions.length === 0) {
      continue;
    }

    const entries = map.get(link.menu_item_id) ?? [];
    entries.push({ group, options: groupOptions });
    map.set(link.menu_item_id, entries);
  }

  return map;
}

/**
 * Lowest price an item can be ordered at with its options, and whether any
 * option changes the price. The card shows "from <min>" when it varies, so a
 * required paid upgrade never looks cheaper than it is. Mirrors the sheet:
 * a required group needs min(min_select, options) choices, cheapest first.
 */
export function optionPriceRange(
  basePrice: number,
  groups: ResolvedOptionGroup[]
): { min: number; varies: boolean } {
  let min = basePrice;
  let varies = false;

  for (const { group, options } of groups) {
    const available = options.filter((option) => option.is_available);
    if (available.some((option) => Number(option.price_delta) !== 0)) {
      varies = true;
    }
    const needed = Math.min(group.min_select, available.length);
    if (needed > 0) {
      const cheapest = available
        .map((option) => Number(option.price_delta))
        .sort((first, second) => first - second)
        .slice(0, needed);
      min += cheapest.reduce((sum, delta) => sum + delta, 0);
    }
  }

  return { min: Math.max(0, Math.round(min * 100) / 100), varies };
}
