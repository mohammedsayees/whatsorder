import type { CustomerLanguage } from "@/lib/customer-i18n";

/**
 * Checkout details a customer chose to remember on their own device.
 *
 * Every store is served from the same origin, so the storage key is per
 * restaurant slug: details saved at one store never prefill another store's
 * checkout (per-tenant PII rule). Nothing here is sent anywhere except as the
 * customer's own form submission.
 */
export type SavedCustomerDetails = {
  name: string;
  phone: string;
  area: string;
  building: string;
  flat: string;
  details: string;
  landmark: string;
  latitude: number | null;
  longitude: number | null;
};

export const ADDRESS_LIMITS = {
  name: 120,
  phone: 24,
  area: 120,
  building: 120,
  flat: 60,
  details: 300,
  landmark: 250
} as const;

const STRING_FIELDS = Object.keys(ADDRESS_LIMITS) as (keyof typeof ADDRESS_LIMITS)[];

export function savedDetailsStorageKey(restaurantSlug: string) {
  return `whatsorder-details-v1-${restaurantSlug}`;
}

export function emptySavedDetails(): SavedCustomerDetails {
  return {
    name: "",
    phone: "",
    area: "",
    building: "",
    flat: "",
    details: "",
    landmark: "",
    latitude: null,
    longitude: null
  };
}

function coordinate(value: unknown, limit: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit
    ? value
    : null;
}

/** Reads stored details defensively: storage is user-editable. */
export function parseSavedDetails(raw: string | null): SavedCustomerDetails | null {
  if (!raw) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const source = parsed as Record<string, unknown>;
  const result = emptySavedDetails();

  for (const field of STRING_FIELDS) {
    const value = source[field];
    result[field] = typeof value === "string" ? value.trim().slice(0, ADDRESS_LIMITS[field]) : "";
  }

  const latitude = coordinate(source.latitude, 90);
  const longitude = coordinate(source.longitude, 180);

  // Keep coordinates only as a pair.
  if (latitude !== null && longitude !== null) {
    result.latitude = latitude;
    result.longitude = longitude;
  }

  return STRING_FIELDS.some((field) => result[field]) ? result : null;
}

const ADDRESS_LABELS: Record<CustomerLanguage, { building: string; flat: string }> = {
  en: { building: "Building/Villa", flat: "Flat/Floor" },
  ar: { building: "المبنى/الفيلا", flat: "الشقة/الطابق" }
};

/**
 * Joins the structured fields into the single delivery_address the order
 * pipeline already stores and prints, labelled so staff can read it at a
 * glance. Stays within the server's 500-character limit.
 */
export function composeDeliveryAddress(
  parts: { building: string; flat: string; details: string },
  language: CustomerLanguage
): string {
  const labels = ADDRESS_LABELS[language];
  const building = parts.building.trim();
  const flat = parts.flat.trim();
  const details = parts.details.trim();

  return [
    building ? `${labels.building}: ${building}` : "",
    flat ? `${labels.flat}: ${flat}` : "",
    details
  ]
    .filter(Boolean)
    .join(", ")
    .slice(0, 500);
}

/**
 * Addresses saved before the structured form are one free-text line, which
 * would land in "Street & directions" next to an empty, required-looking
 * Building field. Move a short single line into Building instead; long or
 * multi-part text stays where it is (the order still composes the same).
 */
export function liftLegacyAddress<T extends { building: string; flat: string; details: string }>(
  parts: T
): T {
  const legacy = parts.details.trim();
  if (parts.building.trim() || parts.flat.trim() || !legacy || legacy.length > ADDRESS_LIMITS.building) {
    return parts;
  }
  return { ...parts, building: legacy, details: "" };
}

/** Non-personal checkout choices remembered per store on this device. */
export type CheckoutPreferences = {
  paymentMethod: string | null;
  consentMarketing: boolean | null;
};

export function checkoutPreferencesStorageKey(restaurantSlug: string) {
  return `whatsorder-checkout-prefs-v1-${restaurantSlug}`;
}

/** Reads stored preferences defensively; unknown payment methods are dropped. */
export function parseCheckoutPreferences(
  raw: string | null,
  allowedPaymentMethods: readonly string[]
): CheckoutPreferences {
  const empty: CheckoutPreferences = { paymentMethod: null, consentMarketing: null };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty;
    return {
      paymentMethod:
        typeof parsed.paymentMethod === "string" && allowedPaymentMethods.includes(parsed.paymentMethod)
          ? parsed.paymentMethod
          : null,
      consentMarketing: typeof parsed.consentMarketing === "boolean" ? parsed.consentMarketing : null
    };
  } catch {
    return empty;
  }
}
