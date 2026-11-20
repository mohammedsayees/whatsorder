// lib/promo-assignment-data.ts
//
// Server-only reads/writes for personal vouchers. Every query is scoped to
// the owner's restaurant; tenant consistency is also enforced by the
// composite foreign keys on promo_code_assignments.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CUSTOMER_SEARCH_LIMIT,
  phoneDigits,
  type VoucherRecipient
} from "@/lib/promo-assignments";

type CustomerRow = { id: string; name: string | null; phone: string };

function toRecipient(row: CustomerRow): VoucherRecipient {
  return { customerId: row.id, name: row.name, phone: row.phone };
}

/** Customers of this restaurant matching a cleaned search (name or phone). */
export async function searchRestaurantCustomers(
  supabase: SupabaseClient,
  restaurantId: string,
  search: string
): Promise<VoucherRecipient[]> {
  const digits = phoneDigits(search);
  const [byName, byPhone] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, phone")
      .eq("restaurant_id", restaurantId)
      .ilike("name", `%${search}%`)
      .order("last_order_at", { ascending: false, nullsFirst: false })
      .limit(CUSTOMER_SEARCH_LIMIT),
    digits
      ? supabase
          .from("customers")
          .select("id, name, phone")
          .eq("restaurant_id", restaurantId)
          .like("phone", `%${digits}%`)
          .limit(CUSTOMER_SEARCH_LIMIT)
      : Promise.resolve({ data: [] as CustomerRow[], error: null })
  ]);
  if (byName.error || byPhone.error) {
    throw new Error("Customers could not be searched.");
  }
  const seen = new Set<string>();
  return [...((byPhone.data ?? []) as CustomerRow[]), ...((byName.data ?? []) as CustomerRow[])]
    .filter((row) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
    .slice(0, CUSTOMER_SEARCH_LIMIT)
    .map(toRecipient);
}

/** The customers a code is assigned to, newest first. */
export async function listCodeRecipients(
  supabase: SupabaseClient,
  restaurantId: string,
  promoCodeId: string
): Promise<VoucherRecipient[]> {
  const { data: assignments, error } = await supabase
    .from("promo_code_assignments")
    .select("customer_id")
    .eq("restaurant_id", restaurantId)
    .eq("promo_code_id", promoCodeId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error("Recipients could not be loaded.");
  }
  const ids = (assignments ?? []).map((row) => (row as { customer_id: string }).customer_id);
  if (ids.length === 0) {
    return [];
  }
  const { data: customers, error: customerError } = await supabase
    .from("customers")
    .select("id, name, phone")
    .eq("restaurant_id", restaurantId)
    .in("id", ids);
  if (customerError) {
    throw new Error("Recipients could not be loaded.");
  }
  const byId = new Map(((customers ?? []) as CustomerRow[]).map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [toRecipient(row)] : [];
  });
}

/** Per-code recipient counts for the admin list. */
export async function countCodeRecipients(
  supabase: SupabaseClient,
  restaurantId: string
): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("promo_code_assignments")
    .select("promo_code_id")
    .eq("restaurant_id", restaurantId);
  const counts = new Map<string, number>();
  if (error) {
    return counts;
  }
  for (const row of (data ?? []) as Array<{ promo_code_id: string }>) {
    counts.set(row.promo_code_id, (counts.get(row.promo_code_id) ?? 0) + 1);
  }
  return counts;
}
