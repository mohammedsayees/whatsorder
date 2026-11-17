// "Goes well with your order": one add-on suggestion at checkout, learned
// from what this restaurant's customers actually order together. No AI and
// no personal data: only item ids from recent orders are counted.

export type SuggestionItem = {
  id: string;
  category_id: string;
  name: string;
  name_ar: string | null;
  price: number;
  image_url: string | null;
};

export type CheckoutSuggestions = {
  /** item id -> companion item ids, most often ordered together first. */
  companions: Record<string, string[]>;
  /** Most-ordered eligible items, used when there is no companion. */
  popular: string[];
  /** Eligible items (available, no options to choose, public). */
  items: Record<string, SuggestionItem>;
};

export const MAX_COMPANIONS_PER_ITEM = 3;
/** A pairing must appear in at least this many orders to count. */
export const MIN_PAIR_ORDERS = 2;

type OrderItems = { items: { item_id: string }[] | null }[];

/**
 * Counts, for every eligible item, which other eligible items appear in the
 * same orders, and how often each eligible item is ordered at all.
 */
export function learnSuggestions(
  orders: OrderItems,
  eligible: Record<string, SuggestionItem>
): Pick<CheckoutSuggestions, "companions" | "popular"> {
  const pairCounts = new Map<string, Map<string, number>>();
  const orderCounts = new Map<string, number>();

  for (const order of orders) {
    const ids = [
      ...new Set((order.items ?? []).map((line) => String(line?.item_id ?? "")).filter(Boolean))
    ];

    for (const id of ids) {
      if (eligible[id]) {
        orderCounts.set(id, (orderCounts.get(id) ?? 0) + 1);
      }
    }

    for (const from of ids) {
      for (const to of ids) {
        if (from === to || !eligible[to]) {
          continue;
        }

        const row = pairCounts.get(from) ?? new Map<string, number>();
        row.set(to, (row.get(to) ?? 0) + 1);
        pairCounts.set(from, row);
      }
    }
  }

  const companions: Record<string, string[]> = {};

  for (const [from, row] of pairCounts) {
    const ranked = [...row.entries()]
      .filter(([, count]) => count >= MIN_PAIR_ORDERS)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, MAX_COMPANIONS_PER_ITEM)
      .map(([id]) => id);

    if (ranked.length > 0) {
      companions[from] = ranked;
    }
  }

  const popular = [...orderCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([id]) => id);

  return { companions, popular };
}

/**
 * Picks at most one suggestion for the current cart: a companion of the
 * biggest line first, then the restaurant's popular items. Never suggests
 * something already in the cart, from the same category as everything in
 * the cart, or priced above half the subtotal (minimum AED 10 ceiling), so
 * it stays a small add-on rather than a second meal.
 */
export function pickSuggestion(
  cart: { item_id: string; quantity: number }[],
  subtotal: number,
  suggestions: CheckoutSuggestions | null
): SuggestionItem | null {
  if (!suggestions || cart.length === 0) {
    return null;
  }

  const inCart = new Set(cart.map((line) => line.item_id));
  const cartCategories = new Set(
    cart.map((line) => suggestions.items[line.item_id]?.category_id).filter(Boolean)
  );
  const allSameCategory = cartCategories.size === 1 && cart.every((line) => suggestions.items[line.item_id]);
  const ceiling = Math.max(10, subtotal * 0.5);
  const acceptable = (id: string) => {
    const item = suggestions.items[id];
    return (
      item &&
      !inCart.has(id) &&
      item.price > 0 &&
      item.price <= ceiling &&
      !(allSameCategory && cartCategories.has(item.category_id))
    );
  };

  const byQuantity = [...cart].sort((a, b) => b.quantity - a.quantity);

  for (const line of byQuantity) {
    const match = (suggestions.companions[line.item_id] ?? []).find(acceptable);

    if (match) {
      return suggestions.items[match];
    }
  }

  const fallback = suggestions.popular.find(acceptable);
  return fallback ? suggestions.items[fallback] : null;
}
