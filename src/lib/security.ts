import type { CartLine, RestaurantStatus } from "@/lib/types";

export const MAX_CART_LINES = 50;
export const MAX_ITEM_QUANTITY = 25;
export const MAX_ORDER_QUANTITY = 100;

export function parseAndValidateCart(raw: string): CartLine[] {
  const parsed = JSON.parse(raw) as CartLine[];

  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_CART_LINES) {
    return [];
  }

  const items = parsed
    .filter(
      (item) =>
        item.item_id &&
        item.name &&
        Number.isFinite(Number(item.quantity)) &&
        item.quantity > 0 &&
        item.quantity <= MAX_ITEM_QUANTITY &&
        Number.isFinite(Number(item.price)) &&
        item.price >= 0
    )
    .map((item) => ({
      item_id: String(item.item_id),
      ...(item.offer_id ? { offer_id: String(item.offer_id) } : {}),
      ...(item.offer_max_quantity
        ? { offer_max_quantity: Math.floor(Number(item.offer_max_quantity)) }
        : {}),
      name: String(item.name),
      name_ar: item.name_ar ? String(item.name_ar) : null,
      quantity: Math.floor(Number(item.quantity)),
      price: Number(item.price)
    }));

  if (
    items.length !== parsed.length ||
    items.reduce((sum, item) => sum + item.quantity, 0) > MAX_ORDER_QUANTITY
  ) {
    return [];
  }

  return items;
}

export function isValidCustomerPhone(phone: string) {
  return /^\+?[0-9][0-9\s()-]{5,22}$/.test(phone);
}

export function isOfferQuantityAllowed(quantity: number, maximumQuantity: number) {
  return (
    Number.isInteger(quantity) &&
    Number.isInteger(maximumQuantity) &&
    quantity > 0 &&
    maximumQuantity > 0 &&
    quantity <= maximumQuantity
  );
}

export function isRestaurantAdminAccessAllowed(status?: RestaurantStatus | null) {
  return !status || !["paused", "cancelled"].includes(status);
}

export function hasValidInvitationMetadata(restaurantId: string, role: string) {
  return (
    restaurantId.length > 0 &&
    ["restaurant_admin", "owner", "manager", "staff"].includes(role)
  );
}

export function classifyMembershipCount(count: number) {
  if (count === 0) {
    return "no_membership" as const;
  }

  if (count > 1) {
    return "multiple_memberships" as const;
  }

  return "ok" as const;
}
