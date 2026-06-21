import { isOfferQuantityAllowed } from "@/lib/security";
import type { CartLine, MenuOffer, MenuWithCategories } from "@/lib/types";

export type VerifiedCart =
  | { ok: true; items: CartLine[]; subtotal: number }
  | { ok: false; error: string };

/**
 * Re-prices a submitted cart against the live menu and offers. Prices are taken
 * from the database, never from the client, so both the customer checkout and
 * the staff order entry produce identical, trusted totals. Returns the verified
 * lines and subtotal, or a customer-facing error describing the first problem.
 */
export function verifyCartAgainstMenu(
  items: CartLine[],
  menu: MenuWithCategories,
  offers: MenuOffer[]
): VerifiedCart {
  const menuItems = new Map(menu.items.map((item) => [item.id, item]));
  const activeOffers = new Map(offers.map((offer) => [offer.id, offer]));
  const verifiedItems: CartLine[] = [];

  for (const cartItem of items) {
    const menuItem = menuItems.get(cartItem.item_id);

    if (!menuItem || !menuItem.is_available) {
      return {
        ok: false,
        error: `${cartItem.name || "One item"} is no longer available. Please review your cart.`
      };
    }

    const offer = cartItem.offer_id ? activeOffers.get(cartItem.offer_id) : null;

    if (cartItem.offer_id && (!offer || offer.menu_item_id !== menuItem.id)) {
      return {
        ok: false,
        error: `${menuItem.name}'s offer is no longer available. Please review your cart.`
      };
    }

    if (
      offer &&
      !isOfferQuantityAllowed(cartItem.quantity, offer.max_quantity_per_order)
    ) {
      return {
        ok: false,
        error: `${offer.title} is limited to ${offer.max_quantity_per_order} per order.`
      };
    }

    verifiedItems.push({
      item_id: menuItem.id,
      offer_id: offer?.id ?? null,
      offer_max_quantity: offer?.max_quantity_per_order ?? null,
      name: menuItem.name,
      name_ar: menuItem.name_ar ?? null,
      price: offer ? Number(offer.promotional_price) : menuItem.price,
      quantity: Math.max(1, Math.floor(cartItem.quantity))
    });
  }

  const subtotal = verifiedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return { ok: true, items: verifiedItems, subtotal };
}
