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

  // Device copies saved before this fix may repeat the composed address here.
  result.details = cleanAddressDetails(result);

  return STRING_FIELDS.some((field) => result[field]) ? result : null;
}

const ADDRESS_LABELS: Record<CustomerLanguage, { building: string; flat: string }> = {
  en: { building: "Building/Villa", flat: "Flat/Floor" },
  ar: { building: "المبنى/الفيلا", flat: "الشقة/الطابق" }
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/**
 * "Street & directions" must hold only what the customer typed there. Older
 * saved addresses and device copies also carry the composed
 * "Building/Villa: X, Flat/Floor: Y" text in that field, which then printed
 * twice on every order. Removes those leading labelled segments, but only for
 * a part that is also filled in separately, so no address text is ever lost.
 */
export function cleanAddressDetails(parts: { building: string; flat: string; details: string }): string {
  const building = parts.building.trim();
  const flat = parts.flat.trim();
  let rest = parts.details.trim();

  for (let pass = 0; pass < 6 && rest; pass += 1) {
    const before = rest;

    for (const labels of Object.values(ADDRESS_LABELS)) {
      // Exact copy of what compose would produce (handles commas inside values).
      const head = [
        building ? `${labels.building}: ${building}` : "",
        flat ? `${labels.flat}: ${flat}` : ""
      ]
        .filter(Boolean)
        .join(", ");

      if (head && (rest === head || rest.startsWith(`${head},`))) {
        rest = rest.slice(head.length).replace(/^,\s*/, "").trim();
        continue;
      }

      // A stale copy, e.g. the flat was edited after the text was saved.
      const labelled = (label: string) =>
        new RegExp(`^${escapeRegExp(label)}:[^,]*(?:,\\s*|$)`);

      if (building && labelled(labels.building).test(rest)) {
        rest = rest.replace(labelled(labels.building), "").trim();
      }
      if (flat && labelled(labels.flat).test(rest)) {
        rest = rest.replace(labelled(labels.flat), "").trim();
      }
    }

    if (rest === before) {
      break;
    }
  }

  return rest;
}

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
  const details = cleanAddressDetails(parts);

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
  if (parts.building.trim() || parts.flat.trim() || !legacy) {
    return parts;
  }

  // The last order's delivery_address is the composed
  // "Building/Villa: X, Flat/Floor: Y[, more]" text: split it back into fields
  // instead of dropping the whole line into Building.
  const composed = parseComposedAddress(legacy);
  if (composed) {
    return { ...parts, ...composed };
  }

  if (legacy.length > ADDRESS_LIMITS.building) {
    return parts;
  }
  return { ...parts, building: legacy, details: "" };
}

/** Inverse of composeDeliveryAddress; null when the text is not in that format. */
export function parseComposedAddress(
  value: string
): { building: string; flat: string; details: string } | null {
  const text = value.trim();

  for (const labels of Object.values(ADDRESS_LABELS)) {
    const building = new RegExp(`^${escapeRegExp(labels.building)}:\\s*([^,]+?)\\s*(?:,\\s*|$)`).exec(text);
    if (!building) {
      continue;
    }

    let rest = text.slice(building[0].length);
    const flat = new RegExp(`^${escapeRegExp(labels.flat)}:\\s*([^,]+?)\\s*(?:,\\s*|$)`).exec(rest);
    if (flat) {
      rest = rest.slice(flat[0].length);
    }

    return {
      building: building[1].slice(0, ADDRESS_LIMITS.building),
      flat: (flat?.[1] ?? "").slice(0, ADDRESS_LIMITS.flat),
      details: rest.trim().slice(0, ADDRESS_LIMITS.details)
    };
  }

  return null;
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
