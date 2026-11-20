// lib/customer-addresses-data.ts
//
// Server-side reads/writes of a customer's saved addresses. Callers pass the
// identity from the verified customer session (never from the request); the
// RPCs scope every row to that restaurant + phone.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import {
  parseSavedAddresses,
  type SavedAddress,
  type SavedAddressInput
} from "@/lib/customer-addresses";

export interface CustomerIdentityKey {
  restaurantId: string;
  phone: string;
}

export type AddressWriteError =
  | "customer_not_found"
  | "limit_reached"
  | "not_found"
  | "invalid"
  | "failed";

export type AddressWriteResult = { ok: true; id?: string } | { ok: false; error: AddressWriteError };

const KNOWN_ERRORS = new Set<AddressWriteError>([
  "customer_not_found",
  "limit_reached",
  "not_found",
  "invalid"
]);

function writeResult(data: unknown, error: { code?: string } | null, label: string): AddressWriteResult {
  if (error) {
    console.error(`WhatsOrder customer address ${label} failed`, error.code);
    return { ok: false, error: "failed" };
  }
  const payload = (data ?? {}) as { ok?: boolean; id?: string; reason?: string };
  if (payload.ok === true) {
    return { ok: true, id: payload.id };
  }
  const reason = payload.reason as AddressWriteError;
  return { ok: false, error: KNOWN_ERRORS.has(reason) ? reason : "failed" };
}

/** Never throws: an unavailable lookup reads as "no saved addresses". */
export async function loadCustomerAddresses(identity: CustomerIdentityKey): Promise<SavedAddress[]> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return [];
  }
  const { data, error } = await admin.rpc("get_customer_addresses", {
    p_restaurant_id: identity.restaurantId,
    p_phone: identity.phone
  });
  if (error) {
    console.error("WhatsOrder customer addresses lookup failed", error.code);
    return [];
  }
  return parseSavedAddresses(data);
}

export async function saveCustomerAddress(
  identity: CustomerIdentityKey,
  addressId: string | null,
  address: SavedAddressInput,
  makeDefault: boolean
): Promise<AddressWriteResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: "failed" };
  }
  const { data, error } = await admin.rpc("save_customer_address", {
    p_restaurant_id: identity.restaurantId,
    p_phone: identity.phone,
    p_address_id: addressId,
    p_label: address.label,
    p_area: address.area,
    p_building: address.building,
    p_flat: address.flat,
    p_details: address.details,
    p_landmark: address.landmark,
    p_latitude: address.latitude,
    p_longitude: address.longitude,
    p_make_default: makeDefault
  });
  return writeResult(data, error, "save");
}

export async function setDefaultCustomerAddress(
  identity: CustomerIdentityKey,
  addressId: string
): Promise<AddressWriteResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: "failed" };
  }
  const { data, error } = await admin.rpc("set_default_customer_address", {
    p_restaurant_id: identity.restaurantId,
    p_phone: identity.phone,
    p_address_id: addressId
  });
  return writeResult(data, error, "default");
}

export async function deleteCustomerAddress(
  identity: CustomerIdentityKey,
  addressId: string
): Promise<AddressWriteResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: "failed" };
  }
  const { data, error } = await admin.rpc("delete_customer_address", {
    p_restaurant_id: identity.restaurantId,
    p_phone: identity.phone,
    p_address_id: addressId
  });
  return writeResult(data, error, "delete");
}
