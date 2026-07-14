import { configuredUnitPrice } from "@/lib/cart-line";
import { isOfferQuantityAllowed } from "@/lib/security";
import type {
  CartLine,
  CartLineOption,
  MenuOffer,
  MenuOption,
  MenuOptionCatalog,
  MenuWithCategories
} from "@/lib/types";

const EMPTY_OPTION_CATALOG: MenuOptionCatalog = {
  groups: [],
  options: [],
  links: []
};

export type VerifiedCart =
  | { ok: true; items: CartLine[]; subtotal: number }
  | { ok: false; error: string };

export type OfferLimitVerification =
  | { ok: true }
  | { ok: false; error: string };

/**
 * An offer may be applied to an order only while it is active AND inside its
 * optional date window. This is the pricing-trust check: the admin UI shows
 * the window, but until now nothing enforced it, so a lapsed offer kept
 * selling at the promotional price until someone toggled it off.
 */
export function isOfferOrderable(offer: MenuOffer, now: Date = new Date()): boolean {
  if (!offer.is_active) {
    return false;
  }

  const time = now.getTime();

  if (offer.starts_at && time < new Date(offer.starts_at).getTime()) {
    return false;
  }

  if (offer.ends_at && time > new Date(offer.ends_at).getTime()) {
    return false;
  }

  return true;
}

/**
 * Adding items to an unpaid ticket must not reset an offer's per-order cap.
 * The new lines have already been verified against the live offer catalog;
 * this check combines them with the stored order snapshot before amendment.
 */
export function verifyCombinedOfferLimits(
  existingItems: CartLine[],
  addedItems: CartLine[],
  offers: MenuOffer[]
): OfferLimitVerification {
  const offersById = new Map(offers.map((offer) => [offer.id, offer]));
  const quantityByOfferId = new Map<string, number>();

  for (const line of [...existingItems, ...addedItems]) {
    if (line.offer_id) {
      quantityByOfferId.set(
        line.offer_id,
        (quantityByOfferId.get(line.offer_id) ?? 0) + line.quantity
      );
    }
  }

  for (const [offerId, quantity] of quantityByOfferId) {
    const offer = offersById.get(offerId);

    if (offer && !isOfferQuantityAllowed(quantity, offer.max_quantity_per_order)) {
      return {
        ok: false,
        error: `${offer.title} is limited to ${offer.max_quantity_per_order} per order.`
      };
    }
  }

  return { ok: true };
}

type OptionVerification =
  | { ok: true; options: CartLineOption[] }
  | { ok: false };

/**
 * Verifies one line's submitted options against the catalog and returns the
 * DB-truth snapshot (names/deltas re-read, client values ignored).
 *
 * Rules:
 *  - every submitted option must exist, be available, match its claimed
 *    group, and belong to a group linked to this item;
 *  - no duplicate options on a line (add-on quantities are out of scope);
 *  - per linked group, the selection count must be within min/max. A group's
 *    effective minimum is min(min_select, available option count) so a
 *    required group whose options are all unavailable cannot make the item
 *    unorderable.
 */
function verifyLineOptions(
  cartItem: CartLine,
  catalog: MenuOptionCatalog,
  lookups: {
    optionsById: Map<string, MenuOption>;
    linkedGroupIdsByItemId: Map<string, string[]>;
    availableCountByGroupId: Map<string, number>;
  }
): OptionVerification {
  const submitted = cartItem.options ?? [];
  const linkedGroupIds = lookups.linkedGroupIdsByItemId.get(cartItem.item_id) ?? [];

  if (submitted.length === 0 && linkedGroupIds.length === 0) {
    return { ok: true, options: [] };
  }

  const selectedCountByGroup = new Map<string, number>();
  const seenOptionIds = new Set<string>();
  const snapshot: CartLineOption[] = [];

  for (const selection of submitted) {
    const option = lookups.optionsById.get(selection.option_id);

    if (
      !option ||
      !option.is_available ||
      option.group_id !== selection.group_id ||
      !linkedGroupIds.includes(option.group_id) ||
      seenOptionIds.has(option.id)
    ) {
      return { ok: false };
    }

    seenOptionIds.add(option.id);
    selectedCountByGroup.set(
      option.group_id,
      (selectedCountByGroup.get(option.group_id) ?? 0) + 1
    );
    snapshot.push({
      option_id: option.id,
      group_id: option.group_id,
      name: option.name,
      name_ar: option.name_ar ?? null,
      price_delta: Number(option.price_delta)
    });
  }

  const groupsById = new Map(catalog.groups.map((group) => [group.id, group]));

  for (const groupId of linkedGroupIds) {
    const group = groupsById.get(groupId);

    if (!group) {
      continue;
    }

    const selectedCount = selectedCountByGroup.get(groupId) ?? 0;
    const availableCount = lookups.availableCountByGroupId.get(groupId) ?? 0;
    const effectiveMin = Math.min(Number(group.min_select), availableCount);
    const max = group.max_select === null ? Infinity : Number(group.max_select);

    if (selectedCount < effectiveMin || selectedCount > max) {
      return { ok: false };
    }
  }

  return { ok: true, options: snapshot };
}

/**
 * Re-prices a submitted cart against the live menu, offers, and option
 * catalog. Prices are taken from the database, never from the client, so both
 * the customer checkout and the staff order entry produce identical, trusted
 * totals. A line's unit price = (offer promotional price or item base price)
 * + the sum of its option deltas, clamped at zero. Returns the verified lines
 * and subtotal, or a customer-facing error describing the first problem.
 */
export function verifyCartAgainstMenu(
  items: CartLine[],
  menu: MenuWithCategories,
  offers: MenuOffer[],
  optionCatalog: MenuOptionCatalog = EMPTY_OPTION_CATALOG
): VerifiedCart {
  const menuItems = new Map(menu.items.map((item) => [item.id, item]));
  const activeOffers = new Map(offers.map((offer) => [offer.id, offer]));
  const verifiedItems: CartLine[] = [];

  const optionsById = new Map(
    optionCatalog.options.map((option) => [option.id, option])
  );
  const linkedGroupIdsByItemId = new Map<string, string[]>();
  for (const link of [...optionCatalog.links].sort(
    (first, second) => first.display_order - second.display_order
  )) {
    const groupIds = linkedGroupIdsByItemId.get(link.menu_item_id) ?? [];
    groupIds.push(link.group_id);
    linkedGroupIdsByItemId.set(link.menu_item_id, groupIds);
  }
  const availableCountByGroupId = new Map<string, number>();
  for (const option of optionCatalog.options) {
    if (option.is_available) {
      availableCountByGroupId.set(
        option.group_id,
        (availableCountByGroupId.get(option.group_id) ?? 0) + 1
      );
    }
  }
  const optionLookups = { optionsById, linkedGroupIdsByItemId, availableCountByGroupId };

  for (const cartItem of items) {
    const menuItem = menuItems.get(cartItem.item_id);

    if (!menuItem || !menuItem.is_available) {
      return {
        ok: false,
        error: `${cartItem.name || "One item"} is no longer available. Please review your cart.`
      };
    }

    const offer = cartItem.offer_id ? activeOffers.get(cartItem.offer_id) : null;

    if (
      cartItem.offer_id &&
      (!offer || offer.menu_item_id !== menuItem.id || !isOfferOrderable(offer))
    ) {
      return {
        ok: false,
        error: `${menuItem.name}'s offer is no longer available. Please review your cart.`
      };
    }

    const optionResult = verifyLineOptions(cartItem, optionCatalog, optionLookups);

    if (!optionResult.ok) {
      return {
        ok: false,
        error: `${menuItem.name}'s options have changed. Please re-add it to your cart.`
      };
    }

    const basePrice = offer ? Number(offer.promotional_price) : menuItem.price;

    verifiedItems.push({
      item_id: menuItem.id,
      offer_id: offer?.id ?? null,
      offer_max_quantity: offer?.max_quantity_per_order ?? null,
      name: menuItem.name,
      name_ar: menuItem.name_ar ?? null,
      price: configuredUnitPrice(basePrice, optionResult.options),
      quantity: Math.max(1, Math.floor(cartItem.quantity)),
      // Omit the key entirely for optionless lines so legacy-shaped jsonb
      // keeps being written for the common case.
      ...(optionResult.options.length > 0 ? { options: optionResult.options } : {})
    });
  }

  // Offer quantity caps are enforced on the PER-OFFER TOTAL across lines: the
  // same item+offer can now span several lines (different configurations), so
  // a per-line check would be bypassable by splitting.
  const quantityByOfferId = new Map<string, number>();
  for (const line of verifiedItems) {
    if (line.offer_id) {
      quantityByOfferId.set(
        line.offer_id,
        (quantityByOfferId.get(line.offer_id) ?? 0) + line.quantity
      );
    }
  }
  for (const [offerId, totalQuantity] of quantityByOfferId) {
    const offer = activeOffers.get(offerId);
    if (
      offer &&
      !isOfferQuantityAllowed(totalQuantity, offer.max_quantity_per_order)
    ) {
      return {
        ok: false,
        error: `${offer.title} is limited to ${offer.max_quantity_per_order} per order.`
      };
    }
  }

  const subtotal = verifiedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return { ok: true, items: verifiedItems, subtotal };
}
