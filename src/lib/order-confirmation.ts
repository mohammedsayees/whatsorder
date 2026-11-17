import "server-only";

import { getOrderPushAuthorization } from "@/lib/push-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isClientOrderId } from "@/lib/staff-order-payload";
import type { StatusEvent } from "@/lib/order-progress";
import type { CartLine, FulfilmentType, OrderStatus } from "@/lib/types";

export type OrderConfirmation = {
  id: string;
  items: CartLine[];
  total: number;
  status: OrderStatus;
  whatsapp_message: string;
  created_at: string | null;
  fulfilment_type: FulfilmentType | null;
  /** Status history for the customer timeline: statuses and times only. */
  status_events: StatusEvent[];
};

// A URL reference alone never authorizes access to the order or its message.
export async function loadOrderConfirmation(
  restaurantId: string,
  orderId: string
): Promise<OrderConfirmation | null> {
  if (!isClientOrderId(orderId)) return null;
  const authorization = await getOrderPushAuthorization(orderId);
  if (authorization?.restaurantId !== restaurantId || authorization.orderId !== orderId) {
    return null;
  }
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Order confirmation is temporarily unavailable.");
  const [orderResult, eventsResult] = await Promise.all([
    admin
      .from("orders")
      .select("id,items,total,status,whatsapp_message,created_at,fulfilment_type")
      .eq("restaurant_id", restaurantId)
      .eq("id", orderId)
      .maybeSingle(),
    // Staff names, roles and reasons stay private: statuses and times only.
    admin
      .from("order_status_events")
      .select("to_status,created_at")
      .eq("restaurant_id", restaurantId)
      .eq("order_id", orderId)
      .order("created_at", { ascending: true })
      .limit(50)
  ]);
  if (orderResult.error) {
    throw new Error("Order confirmation could not be loaded. Please retry.");
  }
  if (!orderResult.data) return null;
  const order = orderResult.data as Omit<OrderConfirmation, "status_events">;
  // The timeline is a nicety: an events failure still shows the order.
  const statusEvents = eventsResult.error
    ? []
    : ((eventsResult.data ?? []) as StatusEvent[]);
  return {
    ...order,
    created_at: order.created_at ?? null,
    fulfilment_type: order.fulfilment_type ?? null,
    status_events: statusEvents
  };
}

