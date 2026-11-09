import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import type { DeliveryRider, OrderRiderAssignment } from "@/lib/types";

export async function getDeliveryRiders(restaurantId: string): Promise<DeliveryRider[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin
    .from("delivery_riders")
    .select("id, restaurant_id, name, phone, is_active, created_at")
    .eq("restaurant_id", restaurantId)
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    throw new Error("Rider directory could not be loaded.");
  }
  return (data ?? []) as DeliveryRider[];
}

export async function getLatestOrderRiderAssignments(
  restaurantId: string,
  orderIds: string[]
): Promise<Record<string, OrderRiderAssignment>> {
  if (orderIds.length === 0) return {};
  const admin = getSupabaseAdmin();
  if (!admin) return {};

  const { data, error } = await admin
    .from("order_rider_assignments")
    .select(
      "id, restaurant_id, order_id, rider_id, delivery_status, delivery_reason, transport_message_id, created_at"
    )
    .eq("restaurant_id", restaurantId)
    .in("order_id", orderIds)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw new Error("Rider assignments could not be loaded.");
  }

  const latest: Record<string, OrderRiderAssignment> = {};
  for (const row of (data ?? []) as OrderRiderAssignment[]) {
    latest[row.order_id] ??= row;
  }
  return latest;
}
