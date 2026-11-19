import "server-only";

import { getOrderPushAuthorization } from "@/lib/push-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isClientOrderId } from "@/lib/staff-order-payload";
import type { StatusEvent } from "@/lib/order-progress";
import type { CustomerRiderView } from "@/lib/rider-location";
import { getCustomerRiderView } from "@/lib/rider-location-data";
import type { CartLine, FulfilmentType, OrderStatus } from "@/lib/types";
import { asOnlinePaymentStatus, type OnlinePaymentStatus } from "@/lib/stripe/order-payment-rules";

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
  /** Car pickup: when the customer said they arrived, and where they parked. */
  customer_arrived_at: string | null;
  customer_arrival_note: string | null;
  /** Assigned rider (name, phone, recent position) while out for delivery. */
  rider: CustomerRiderView | null;
  /** "Pay online" state; null for cash/card-on-collection orders. */
  online_payment_status?: OnlinePaymentStatus | null;
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
  const [orderResult, eventsResult, arrivalResult, paymentResult] = await Promise.all([
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
      .limit(50),
    // Separate read so the page still loads if the arrival columns are not
    // deployed yet (migration 20261119120000_car_pickup_arrivals).
    admin
      .from("orders")
      .select("customer_arrived_at,customer_arrival_note")
      .eq("restaurant_id", restaurantId)
      .eq("id", orderId)
      .maybeSingle(),
    // Separate read for the same reason (20261124120000_online_order_payments).
    admin
      .from("orders")
      .select("online_payment_status")
      .eq("restaurant_id", restaurantId)
      .eq("id", orderId)
      .maybeSingle()
  ]);
  if (orderResult.error) {
    throw new Error("Order confirmation could not be loaded. Please retry.");
  }
  if (!orderResult.data) return null;
  const order = orderResult.data as Omit<
    OrderConfirmation,
    "status_events" | "customer_arrived_at" | "customer_arrival_note" | "rider" | "online_payment_status"
  >;
  const arrival = arrivalResult.error
    ? null
    : (arrivalResult.data as {
        customer_arrived_at?: string | null;
        customer_arrival_note?: string | null;
      } | null);
  // The timeline is a nicety: an events failure still shows the order.
  const statusEvents = eventsResult.error
    ? []
    : ((eventsResult.data ?? []) as StatusEvent[]);
  return {
    ...order,
    created_at: order.created_at ?? null,
    fulfilment_type: order.fulfilment_type ?? null,
    status_events: statusEvents,
    customer_arrived_at: arrival?.customer_arrived_at ?? null,
    customer_arrival_note: arrival?.customer_arrival_note ?? null,
    online_payment_status: paymentResult.error
      ? null
      : asOnlinePaymentStatus((paymentResult.data as { online_payment_status?: unknown } | null)?.online_payment_status),
    rider: await getCustomerRiderView(restaurantId, orderId, {
      status: order.status,
      fulfilment_type: order.fulfilment_type ?? null
    })
  };
}

