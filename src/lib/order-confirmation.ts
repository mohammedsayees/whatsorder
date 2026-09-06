import "server-only";

import { getOrderPushAuthorization } from "@/lib/push-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isClientOrderId } from "@/lib/staff-order-payload";
import type { CartLine, OrderStatus } from "@/lib/types";

export type OrderConfirmation = {
  id: string;
  items: CartLine[];
  total: number;
  status: OrderStatus;
  whatsapp_message: string;
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
  const { data, error } = await admin
    .from("orders")
    .select("id,items,total,status,whatsapp_message")
    .eq("restaurant_id", restaurantId)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error("Order confirmation could not be loaded. Please retry.");
  return data as OrderConfirmation | null;
}
