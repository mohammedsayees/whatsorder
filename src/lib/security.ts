import type { CartLine, CartLineOption, RestaurantStatus } from "@/lib/types";

export const MAX_CART_LINES = 50;
export const MAX_ITEM_QUANTITY = 25;
export const MAX_ORDER_QUANTITY = 100;
export const MAX_OPTIONS_PER_LINE = 10;

// Options are optional on a line; when present they must be a small, sane
// list. Prices/names are re-snapshotted from the database during
// verifyCartAgainstMenu — this only guards shape, not truth.
function isValidOptionList(raw: unknown): raw is CartLineOption[] | undefined {
  if (raw === undefined || raw === null) {
    return true;
  }

  if (!Array.isArray(raw) || raw.length > MAX_OPTIONS_PER_LINE) {
    return false;
  }

  const seenOptionIds = new Set<string>();

  for (const option of raw as CartLineOption[]) {
    if (
      !option ||
      typeof option.option_id !== "string" ||
      !option.option_id ||
      typeof option.group_id !== "string" ||
      !option.group_id ||
      typeof option.name !== "string" ||
      !option.name ||
      !Number.isFinite(Number(option.price_delta)) ||
      seenOptionIds.has(option.option_id)
    ) {
      return false;
    }

    seenOptionIds.add(option.option_id);
  }

  return true;
}

function mapOptions(raw: CartLineOption[] | undefined | null) {
  if (!raw || raw.length === 0) {
    return {};
  }

  return {
    options: raw.map((option) => ({
      option_id: String(option.option_id),
      group_id: String(option.group_id),
      name: String(option.name).slice(0, 120),
      name_ar: option.name_ar ? String(option.name_ar).slice(0, 120) : null,
      price_delta: Number(option.price_delta)
    }))
  };
}

export function minimumOrderRemaining(subtotal: number, minimumOrder: number) {
  return Math.max(0, Number(minimumOrder) - Number(subtotal));
}

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
        item.price >= 0 &&
        isValidOptionList(item.options)
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
      price: Number(item.price),
      ...mapOptions(item.options)
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
