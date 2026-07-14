"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { configuredUnitPrice } from "@/lib/cart-line";
import { formatCurrency } from "@/lib/currency";
import {
  customerTranslations,
  type CustomerLanguage
} from "@/lib/customer-i18n";
import type {
  CartLineOption,
  MenuItem,
  MenuOffer,
  MenuOption,
  MenuOptionCatalog,
  MenuOptionGroup,
  PublicRestaurant
} from "@/lib/types";

// Bottom-sheet option picker for items with attached option groups. Purely
// presentational: the parent decides what "add" means (customer cart vs staff
// ticket). Selection state lives here and resets each open because the parent
// mounts the sheet conditionally.

export type ResolvedOptionGroup = {
  group: MenuOptionGroup;
  options: MenuOption[];
};

/**
 * Groups attached to each item in link order, keeping only available options
 * and dropping groups with none. Items with an entry here should open the
 * options picker instead of instant-add. Shared by the customer menu and the
 * staff punch screen.
 */
export function resolveOptionGroupsByItem(
  catalog: MenuOptionCatalog | undefined
): Map<string, ResolvedOptionGroup[]> {
  const map = new Map<string, ResolvedOptionGroup[]>();

  if (!catalog) {
    return map;
  }

  const groupsById = new Map(catalog.groups.map((group) => [group.id, group]));
  const optionsByGroupId = new Map<string, MenuOption[]>();
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

function isVariantGroup(group: MenuOptionGroup) {
  return group.min_select === 1 && group.max_select === 1;
}

function optionName(option: MenuOption, language: CustomerLanguage) {
  return language === "ar" && option.name_ar ? option.name_ar : option.name;
}

function groupName(group: MenuOptionGroup, language: CustomerLanguage) {
  return language === "ar" && group.name_ar ? group.name_ar : group.name;
}

function deltaLabel(delta: number, restaurant: PublicRestaurant) {
  if (delta === 0) {
    return null;
  }
  return `${delta > 0 ? "+" : "−"}${formatCurrency(Math.abs(delta), restaurant)}`;
}

function toCartOption(option: MenuOption): CartLineOption {
  return {
    option_id: option.id,
    group_id: option.group_id,
    name: option.name,
    name_ar: option.name_ar ?? null,
    price_delta: option.price_delta
  };
}

export function ItemOptionsSheet({
  basePrice,
  groups,
  item,
  language,
  maxQuantity,
  offer,
  onAdd,
  onClose,
  restaurant
}: {
  /** Item base price, or the offer's promotional price when seeded by an offer. */
  basePrice: number;
  groups: ResolvedOptionGroup[];
  item: MenuItem;
  language: CustomerLanguage;
  /** Remaining allowed quantity (offer cap minus in-cart total); undefined = unlimited. */
  maxQuantity?: number;
  offer?: MenuOffer | null;
  onAdd: (options: CartLineOption[], quantity: number) => void;
  onClose: () => void;
  restaurant: PublicRestaurant;
}) {
  const t = customerTranslations[language];
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);

  // Only groups with at least one available option participate; a required
  // group with nothing available must not brick the item (same rule as the
  // server's effective-min check in verifyCartAgainstMenu).
  const activeGroups = useMemo(
    () =>
      groups
        .map(({ group, options }) => ({
          group,
          options: options.filter((option) => option.is_available)
        }))
        .filter(({ options }) => options.length > 0),
    [groups]
  );

  const toggleOption = (group: MenuOptionGroup, optionId: string) => {
    setSelected((current) => {
      const chosen = current[group.id] ?? [];

      if (isVariantGroup(group)) {
        return { ...current, [group.id]: [optionId] };
      }

      if (chosen.includes(optionId)) {
        return { ...current, [group.id]: chosen.filter((id) => id !== optionId) };
      }

      const max = group.max_select ?? Infinity;

      if (chosen.length >= max) {
        return current;
      }

      return { ...current, [group.id]: [...chosen, optionId] };
    });
  };

  const selectedOptions = useMemo(() => {
    const list: CartLineOption[] = [];

    for (const { group, options } of activeGroups) {
      const chosen = selected[group.id] ?? [];
      for (const option of options) {
        if (chosen.includes(option.id)) {
          list.push(toCartOption(option));
        }
      }
    }

    return list;
  }, [activeGroups, selected]);

  const requirementsMet = activeGroups.every(({ group, options }) => {
    const effectiveMin = Math.min(group.min_select, options.length);
    return (selected[group.id] ?? []).length >= effectiveMin;
  });

  const unitPrice = configuredUnitPrice(basePrice, selectedOptions);
  const quantityCap = maxQuantity ?? Infinity;
  const canAdd = requirementsMet && quantity >= 1 && quantity <= quantityCap;
  const itemName = language === "ar" && item.name_ar ? item.name_ar : item.name;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-4">
      <div className="max-h-[88vh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 pb-8 shadow-2xl sm:max-w-md sm:rounded-[28px] sm:pb-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-black">{itemName}</h2>
            {offer ? (
              <p className="mt-1 text-xs font-black text-rose-600">
                {t.offer} · {formatCurrency(basePrice, restaurant)}
              </p>
            ) : null}
          </div>
          <button
            aria-label={t.goBack}
            className="focus-ring rounded-full bg-stone-100 p-2 text-stone-500"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-5">
          {activeGroups.map(({ group, options }) => {
            const variant = isVariantGroup(group);
            const chosen = selected[group.id] ?? [];
            const max = group.max_select ?? Infinity;

            return (
              <section key={group.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-black">{groupName(group, language)}</h3>
                  <span
                    className={`text-[11px] font-black ${
                      group.min_select > 0 ? "text-rose-600" : "text-stone-400"
                    }`}
                  >
                    {variant
                      ? `${t.optionsRequired} · ${t.chooseOne}`
                      : group.min_select > 0
                        ? t.optionsRequired
                        : group.max_select
                          ? `${t.optionsOptional} · ${t.chooseUpTo} ${group.max_select}`
                          : t.optionsOptional}
                  </span>
                </div>
                <div className="mt-2 space-y-2">
                  {options.map((option) => {
                    const isChosen = chosen.includes(option.id);
                    const delta = deltaLabel(option.price_delta, restaurant);
                    const disableUnchosen =
                      !variant && !isChosen && chosen.length >= max;

                    return (
                      <label
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                          isChosen
                            ? "border-leaf bg-mint/15 text-ink"
                            : "border-stone-200 text-stone-700"
                        } ${disableUnchosen ? "opacity-40" : ""}`}
                        key={option.id}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            checked={isChosen}
                            className="accent-leaf"
                            disabled={disableUnchosen}
                            name={variant ? `group-${group.id}` : undefined}
                            onChange={() => toggleOption(group, option.id)}
                            type={variant ? "radio" : "checkbox"}
                          />
                          {optionName(option, language)}
                        </span>
                        {delta ? (
                          <span className="text-xs font-black text-leaf">{delta}</span>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-full border border-stone-200 px-3 py-2">
            <button
              aria-label="-"
              className="focus-ring rounded-full p-1 text-stone-600 disabled:opacity-30"
              disabled={quantity <= 1}
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              type="button"
            >
              <Minus size={16} />
            </button>
            <span className="min-w-6 text-center font-black">{quantity}</span>
            <button
              aria-label="+"
              className="focus-ring rounded-full p-1 text-stone-600 disabled:opacity-30"
              disabled={quantity >= quantityCap}
              onClick={() => setQuantity((value) => Math.min(quantityCap, value + 1))}
              type="button"
            >
              <Plus size={16} />
            </button>
          </div>
          <button
            className="focus-ring flex-1 rounded-full bg-leaf px-4 py-3 font-black text-white disabled:opacity-40"
            disabled={!canAdd}
            onClick={() => onAdd(selectedOptions, quantity)}
            type="button"
          >
            {t.addToCart} · {formatCurrency(unitPrice * quantity, restaurant)}
          </button>
        </div>
      </div>
    </div>
  );
}
