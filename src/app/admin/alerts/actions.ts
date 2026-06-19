"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

export type NewOrderAlertState = {
  newOrderCount: number;
  pendingOrderIds: string[];
};

export async function getNewOrderAlertStateAction(
  orderIds: string[] = []
): Promise<NewOrderAlertState> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return { newOrderCount: 0, pendingOrderIds: [] };
  }

  const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))].slice(0, 100);
  const countQuery = supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", session.restaurantId)
    .eq("status", "New");

  const pendingQuery =
    uniqueOrderIds.length > 0
      ? supabase
          .from("orders")
          .select("id")
          .eq("restaurant_id", session.restaurantId)
          .eq("status", "New")
          .in("id", uniqueOrderIds)
      : Promise.resolve({ data: [], error: null });

  const [{ count, error: countError }, { data, error: pendingError }] =
    await Promise.all([countQuery, pendingQuery]);

  if (countError || pendingError) {
    throw new Error("Unable to refresh new-order alert state.");
  }

  return {
    newOrderCount: count ?? 0,
    pendingOrderIds: (data ?? []).map((order) => String(order.id))
  };
}
