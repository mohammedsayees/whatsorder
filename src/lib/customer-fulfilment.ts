import type { FulfilmentType, PublicRestaurant } from "@/lib/types";

type FulfilmentFlags = Pick<
  PublicRestaurant,
  "delivery_enabled" | "pickup_enabled" | "car_pickup_enabled" | "dine_in_enabled"
>;

const FULFILMENT_TYPES: readonly FulfilmentType[] = [
  "delivery",
  "takeaway",
  "car_pickup",
  "dine_in"
];

/** Fulfilment modes the restaurant offers, in display order. */
export function availableFulfilmentTypes(restaurant: FulfilmentFlags): FulfilmentType[] {
  return [
    ...(restaurant.delivery_enabled !== false ? (["delivery"] as const) : []),
    ...(restaurant.pickup_enabled === true ? (["takeaway"] as const) : []),
    ...(restaurant.car_pickup_enabled === true ? (["car_pickup"] as const) : []),
    ...(restaurant.dine_in_enabled === true ? (["dine_in"] as const) : [])
  ];
}

/**
 * Device-local key for the customer's chosen mode. Every store shares one
 * origin, so the key is per restaurant slug: one store's choice never leaks
 * into another store's page. Only the mode is stored, never personal data.
 */
export function fulfilmentStorageKey(restaurantSlug: string) {
  return `whatsorder-fulfilment-v1-${restaurantSlug}`;
}

export function isFulfilmentType(value: unknown): value is FulfilmentType {
  return typeof value === "string" && (FULFILMENT_TYPES as readonly string[]).includes(value);
}

/**
 * Picks the mode to show. A table number from a dine-in QR code wins, then
 * the customer's saved choice, then the first mode the restaurant offers.
 * A saved mode the restaurant has since switched off is ignored.
 */
export function resolveFulfilmentType({
  available,
  stored,
  tableNumber
}: {
  available: FulfilmentType[];
  stored: unknown;
  tableNumber?: string | null;
}): FulfilmentType {
  if (tableNumber?.trim() && available.includes("dine_in")) {
    return "dine_in";
  }

  if (isFulfilmentType(stored) && available.includes(stored)) {
    return stored;
  }

  return available[0] ?? "delivery";
}
