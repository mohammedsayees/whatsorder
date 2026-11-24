import type { OrderStatus } from "@/lib/types";

/** Shape of the secret in a rider's private link (`/rider/<token>`). */
export const RIDER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,64}$/;

/** Customers only see a rider position this recent. */
export const RIDER_LOCATION_FRESH_MS = 10 * 60 * 1000;
/** The rider page sends at most one position this often. */
export const RIDER_SEND_INTERVAL_MS = 20 * 1000;
/** Ignore fixes worse than this (e.g. coarse network location). */
export const RIDER_MAX_ACCURACY_M = 1000;

/** Statuses while a rider may share location (heading out or delivering). */
export const RIDER_SHARING_STATUSES: readonly OrderStatus[] = [
  "Accepted",
  "Preparing",
  "Ready to Serve",
  "Out for Delivery"
];

/** Customers see the rider only once the order is on its way. */
export function isRiderVisibleToCustomer(status: OrderStatus) {
  return status === "Out for Delivery";
}

export type RiderFix = { latitude: number; longitude: number; accuracy: number | null };

/** Validates an untrusted position from the rider page. */
export function parseRiderFix(value: unknown): RiderFix | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const { latitude, longitude, accuracy } = value as Record<string, unknown>;

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180 ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }

  const acc = typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null;

  if (acc !== null && acc > RIDER_MAX_ACCURACY_M) {
    return null;
  }

  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    accuracy: acc === null ? null : Math.round(acc)
  };
}

/** What the customer's order page receives about the rider. */
export type CustomerRiderView = {
  name: string;
  /** International digits without "+", for a tel: link. */
  phone: string | null;
  location: {
    /** Straight-line distance to the delivery pin, when both are known. */
    distanceKm: number | null;
    updatedAt: string;
    mapsUrl: string;
  } | null;
};

/** "350 m", "1.2 km", "12 km". */
export function formatDistance(km: number) {
  if (km < 1) {
    return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  }

  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** First word of the rider's name: enough to greet them at the door. */
export function riderFirstName(name: string) {
  return name.trim().split(/\s+/)[0]?.slice(0, 40) || "Your rider";
}
