import type { FulfilmentType, PublicRestaurant } from "@/lib/types";

type FulfilmentFlags = Pick<
  PublicRestaurant,
  "delivery_enabled" | "pickup_enabled" | "car_pickup_enabled" | "dine_in_enabled"
>;

// Display order for fulfilment options across the customer menu and the staff
// order screen.
export const fulfilmentOrder: FulfilmentType[] = [
  "delivery",
  "takeaway",
  "car_pickup",
  "dine_in"
];

// Whether a restaurant offers a given fulfilment channel. Delivery defaults on
// when the flag is unset; the others are opt-in. This is the single source of
// truth used by both the customer checkout and the staff order entry.
export function isFulfilmentEnabled(
  restaurant: FulfilmentFlags,
  type: FulfilmentType
): boolean {
  switch (type) {
    case "delivery":
      return restaurant.delivery_enabled !== false;
    case "takeaway":
      return restaurant.pickup_enabled === true;
    case "car_pickup":
      return restaurant.car_pickup_enabled === true;
    case "dine_in":
      return restaurant.dine_in_enabled === true;
    default:
      return false;
  }
}

export function enabledFulfilmentTypes(
  restaurant: FulfilmentFlags
): FulfilmentType[] {
  return fulfilmentOrder.filter((type) => isFulfilmentEnabled(restaurant, type));
}
