// lib/cart-reconcile.ts
//
// A cart is saved on the device and can be days old. When the menu loads,
// bring it in line with the live menu so the customer never fills in
// checkout for an item that is gone or sees a price the server won't charge:
// lines whose item, offer or options no longer validate are dropped, and
// prices are refreshed. Mirrors verifyCartAgainstMenu (lib/order-pricing.ts),
// which stays the authority at checkout. Pure and client-safe.

import { configuredUnitPrice, cartLineKey } from "@/lib/cart-line";
import type { ResolvedOptionGroup } from "@/lib/menu-option-groups";
import type { CartLine, CartLineOption, CustomerMenuItem, CustomerMenuOffer } from "@/lib/types";

export type CartReconciliation = {
  lines: CartLine[];
  /** Lines dropped because the item, offer or chosen options are gone. */
  removed: CartLine[];
  /** Lines kept whose unit price changed. */
  repriced: number;
  changed: boolean;
};

/** Order-independent JSON, so "changed" means a real difference. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function reconcileOptions(
  line: CartLine,
  groups: ResolvedOptionGroup[]
): CartLineOption[] | null {
  const chosen = line.options ?? [];
  if (chosen.length === 0 && groups.length === 0) {
    return [];
  }
  // groups hold available options only (resolveOptionGroupsByItem).
  const optionsById = new Map(
    groups.flatMap(({ options }) => options.map((option) => [option.id, option] as const))
  );
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const fresh: CartLineOption[] = [];

  for (const selection of chosen) {
    const option = optionsById.get(selection.option_id);
    if (!option || option.group_id !== selection.group_id || seen.has(option.id)) {
      return null;
    }
    seen.add(option.id);
    counts.set(option.group_id, (counts.get(option.group_id) ?? 0) + 1);
    fresh.push({
      option_id: option.id,
      group_id: option.group_id,
      name: option.name,
      name_ar: option.name_ar ?? null,
      price_delta: Number(option.price_delta)
    });
  }

  for (const { group, options } of groups) {
    const count = counts.get(group.id) ?? 0;
    const effectiveMin = Math.min(group.min_select, options.length);
    const max = group.max_select ?? Infinity;
    if (count < effectiveMin || count > max) {
      return null;
    }
  }
  return fresh;
}

export function reconcileCartWithMenu(
  lines: CartLine[],
  menu: {
    items: CustomerMenuItem[];
    offers: CustomerMenuOffer[];
    groupsByItemId: Map<string, ResolvedOptionGroup[]>;
  }
): CartReconciliation {
  const itemsById = new Map(menu.items.map((item) => [item.id, item]));
  const offersById = new Map(menu.offers.map((offer) => [offer.id, offer]));
  const kept: CartLine[] = [];
  const removed: CartLine[] = [];
  let repriced = 0;
  let changed = false;

  for (const line of lines) {
    const item = itemsById.get(line.item_id);
    const offer = line.offer_id ? offersById.get(line.offer_id) : null;
    const offerGone = Boolean(line.offer_id) && (!offer || offer.menu_item_id !== line.item_id);
    const options = item && !offerGone ? reconcileOptions(line, menu.groupsByItemId.get(item.id) ?? []) : null;

    if (!item || !item.is_available || offerGone || options === null) {
      removed.push(line);
      changed = true;
      continue;
    }

    const price = configuredUnitPrice(offer ? Number(offer.promotional_price) : item.price, options);
    if (Math.abs(price - line.price) > 0.0001) {
      repriced += 1;
    }
    const next: CartLine = {
      ...line,
      name: item.name,
      name_ar: item.name_ar ?? null,
      price,
      ...(offer ? { offer_max_quantity: offer.max_quantity_per_order } : {}),
      ...(options.length > 0 ? { options } : {})
    };
    if (options.length === 0) {
      delete next.options;
    }
    if (canonical(next) !== canonical(line)) {
      changed = true;
    }
    kept.push(next);
  }

  // Refreshed options can make two lines identical: merge them.
  const merged = new Map<string, CartLine>();
  for (const line of kept) {
    const key = cartLineKey(line);
    const existing = merged.get(key);
    if (existing) {
      merged.set(key, { ...existing, quantity: existing.quantity + line.quantity });
      changed = true;
    } else {
      merged.set(key, line);
    }
  }

  return { lines: [...merged.values()], removed, repriced, changed };
}

/** One sentence for the customer about what the menu check changed, or null. */
export function reconcileNotice(result: CartReconciliation, language: "en" | "ar"): string | null {
  const removed = result.removed.length;
  const parts: string[] = [];
  if (removed > 0) {
    const names = result.removed.map((line) => (language === "ar" && line.name_ar ? line.name_ar : line.name));
    const list = [...new Set(names)].slice(0, 3).join(language === "ar" ? "، " : ", ");
    parts.push(
      language === "ar"
        ? `أزلنا من سلتك ما لم يعد متوفراً أو تغيّرت خياراته: ${list}.`
        : `Removed from your cart because it's no longer available or its options changed: ${list}.`
    );
  }
  if (result.repriced > 0) {
    parts.push(language === "ar" ? "تم تحديث الأسعار في سلتك." : "Prices in your cart were updated.");
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
