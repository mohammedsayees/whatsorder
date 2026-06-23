// Lightweight geo helpers shared by the customer checkout (client) and the
// order server action. Pure math, zero dependencies — safe to include in the
// customer bundle (no geo/map library, protects the ~119 kB budget).

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/lng points in kilometres (haversine).
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

type RestaurantDeliveryArea = {
  latitude?: number | null;
  longitude?: number | null;
  delivery_radius_km?: number | null;
};

/**
 * True when the restaurant enforces a delivery radius. Requires a positive
 * radius AND restaurant coordinates. If any is missing the feature is off and
 * delivery behaves exactly as before (opt-in, backward-compatible).
 */
export function hasDeliveryRadius(
  restaurant: RestaurantDeliveryArea
): restaurant is RestaurantDeliveryArea & {
  latitude: number;
  longitude: number;
  delivery_radius_km: number;
} {
  return (
    typeof restaurant.latitude === "number" &&
    Number.isFinite(restaurant.latitude) &&
    typeof restaurant.longitude === "number" &&
    Number.isFinite(restaurant.longitude) &&
    typeof restaurant.delivery_radius_km === "number" &&
    Number.isFinite(restaurant.delivery_radius_km) &&
    restaurant.delivery_radius_km > 0
  );
}

export type DeliveryRangeCheck = {
  /** Whether a radius is enforced at all. */
  enforced: boolean;
  /** Distance from restaurant to the customer in km, when computable. */
  distanceKm: number | null;
  /** True when delivery is allowed (no radius, or within range). */
  withinRange: boolean;
};

/**
 * Evaluate a delivery location against the restaurant's radius. When no radius
 * is set, delivery is always allowed. When a radius is set but no customer
 * location is provided, delivery is treated as out of range (location required).
 */
export function evaluateDeliveryRange(
  restaurant: RestaurantDeliveryArea,
  customer: { latitude: number | null; longitude: number | null } | null
): DeliveryRangeCheck {
  if (!hasDeliveryRadius(restaurant)) {
    return { enforced: false, distanceKm: null, withinRange: true };
  }

  if (
    !customer ||
    typeof customer.latitude !== "number" ||
    !Number.isFinite(customer.latitude) ||
    typeof customer.longitude !== "number" ||
    !Number.isFinite(customer.longitude)
  ) {
    return { enforced: true, distanceKm: null, withinRange: false };
  }

  const distanceKm = haversineKm(
    restaurant.latitude,
    restaurant.longitude,
    customer.latitude,
    customer.longitude
  );

  return {
    enforced: true,
    distanceKm,
    withinRange: distanceKm <= restaurant.delivery_radius_km
  };
}
