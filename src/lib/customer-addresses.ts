// lib/customer-addresses.ts
//
// Types and pure helpers for a signed-in customer's saved addresses (one
// address book per café). No I/O: the server loader is in
// customer-addresses-data.ts. Safe to import from client components.

import { ADDRESS_LIMITS, cleanAddressDetails } from "@/lib/customer-address";

export const MAX_SAVED_ADDRESSES = 10;
export const ADDRESS_LABEL_MAX_LENGTH = 40;

export interface SavedAddress {
  id: string;
  label: string;
  area: string;
  building: string;
  flat: string;
  details: string;
  landmark: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
}

export type SavedAddressInput = Omit<SavedAddress, "id" | "is_default">;

const TEXT_FIELDS = ["area", "building", "flat", "details", "landmark"] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function coordinate(value: unknown, limit: number): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && Math.abs(number) <= limit
    ? Math.round(number * 1e7) / 1e7
    : null;
}

/**
 * Validates an address the browser sent. Returns null when it is unusable:
 * no label, a field over its limit, nothing to deliver to, or a half pin.
 */
export function cleanSavedAddressInput(input: unknown): SavedAddressInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const source = input as Record<string, unknown>;
  const label = text(source.label);
  if (!label || label.length > ADDRESS_LABEL_MAX_LENGTH) {
    return null;
  }

  const result: SavedAddressInput = {
    label,
    area: "",
    building: "",
    flat: "",
    details: "",
    landmark: "",
    latitude: null,
    longitude: null
  };
  for (const field of TEXT_FIELDS) {
    const value = text(source[field]);
    if (value.length > ADDRESS_LIMITS[field]) {
      return null;
    }
    result[field] = value;
  }
  // Never store the composed address inside the free-text details.
  result.details = cleanAddressDetails(result);

  const hasLatitude = source.latitude !== null && source.latitude !== undefined && source.latitude !== "";
  const hasLongitude = source.longitude !== null && source.longitude !== undefined && source.longitude !== "";
  if (hasLatitude || hasLongitude) {
    const latitude = coordinate(source.latitude, 90);
    const longitude = coordinate(source.longitude, 180);
    if (latitude === null || longitude === null) {
      return null;
    }
    result.latitude = latitude;
    result.longitude = longitude;
  }

  if (!result.area && !result.building && !result.details && result.latitude === null) {
    return null;
  }
  return result;
}

/** Normalizes the RPC's jsonb array; drops malformed rows. */
export function parseSavedAddresses(data: unknown): SavedAddress[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data.flatMap((row): SavedAddress[] => {
    if (!row || typeof row !== "object" || typeof (row as { id?: unknown }).id !== "string") {
      return [];
    }
    const source = row as Record<string, unknown>;
    const latitude = coordinate(source.latitude, 90);
    const longitude = coordinate(source.longitude, 180);
    const paired = latitude !== null && longitude !== null;
    const building = text(source.building);
    const flat = text(source.flat);
    return [
      {
        id: source.id as string,
        label: text(source.label),
        area: text(source.area),
        building,
        flat,
        // Heals rows saved while the composed address was copied in here.
        details: cleanAddressDetails({ building, flat, details: text(source.details) }),
        landmark: text(source.landmark),
        latitude: paired ? latitude : null,
        longitude: paired ? longitude : null,
        is_default: source.is_default === true
      }
    ];
  });
}

/** True when two addresses would deliver to the same place. */
export function isSameAddress(
  a: Pick<SavedAddress, (typeof TEXT_FIELDS)[number]>,
  b: Pick<SavedAddress, (typeof TEXT_FIELDS)[number]>
): boolean {
  return TEXT_FIELDS.every(
    (field) => text(a[field]).toLowerCase() === text(b[field]).toLowerCase()
  );
}

/** One-line summary for lists and pickers. */
export function savedAddressSummary(address: SavedAddressInput): string {
  return [address.building, address.flat, address.details, address.area]
    .filter(Boolean)
    .join(", ");
}
