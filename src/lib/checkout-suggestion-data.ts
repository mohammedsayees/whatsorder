import "server-only";

import { unstable_cache } from "next/cache";
import {
  learnSuggestions,
  type CheckoutSuggestions,
  type SuggestionItem
} from "@/lib/checkout-suggestion";
import { getMenu, getMenuOptionCatalog } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";

const WINDOW_DAYS = 60;
const MAX_ORDERS = 2000;

// Reads only the item ids of this restaurant's recent orders (no customer
// fields). Cached per restaurant for an hour: pairings change slowly.
const readRecentOrderItems = (restaurantId: string) =>
  unstable_cache(
    async () => {
      const admin = getSupabaseAdmin();

      if (!admin) {
        return [];
      }

      const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await admin
        .from("orders")
        .select("items")
        .eq("restaurant_id", restaurantId)
        .neq("status", "Cancelled")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(MAX_ORDERS);

      if (error || !data) {
        throw new Error("Order items unavailable");
      }

      return (data as { items: unknown }[]).map((row) => ({
        items: Array.isArray(row.items)
          ? (row.items as { item_id?: unknown }[]).map((line) => ({ item_id: String(line?.item_id ?? "") }))
          : null
      }));
    },
    ["checkout-suggestion-orders", restaurantId],
    { revalidate: 3600 }
  )();

/**
 * Suggestion data for the checkout page, or null when there is too little
 * history or anything fails (checkout never depends on it).
 */
export async function getCheckoutSuggestions(
  restaurantId: string
): Promise<CheckoutSuggestions | null> {
  try {
    const [menu, catalog, orders] = await Promise.all([
      getMenu(restaurantId),
      getMenuOptionCatalog(restaurantId),
      readRecentOrderItems(restaurantId)
    ]);

    // One-tap add only: available items with no options to choose.
    const withOptions = new Set(catalog.links.map((link) => link.menu_item_id));
    const eligible: Record<string, SuggestionItem> = {};

    for (const item of menu.items) {
      if (item.is_available && !withOptions.has(item.id) && Number(item.price) > 0) {
        eligible[item.id] = {
          id: item.id,
          category_id: item.category_id,
          name: item.name,
          name_ar: item.name_ar ?? null,
          price: Number(item.price),
          image_url: item.image_url ?? null
        };
      }
    }

    const learned = learnSuggestions(orders, eligible);

    if (learned.popular.length === 0 && Object.keys(learned.companions).length === 0) {
      return null;
    }

    // Ship only the items the browser might need: everything eligible is
    // potentially "in the cart" (for category checks), but the menu is small.
    return { ...learned, items: eligible };
  } catch {
    return null;
  }
}
