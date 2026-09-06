"use server";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import { scheduleOrderNotifications } from "@/lib/notification-jobs";
import type { OrderStatus } from "@/lib/types";
const stringValue = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const limitedStringValue = (data: FormData, key: string, limit: number) => stringValue(data, key).slice(0, limit);
function databaseFailure(operation: string, error: { message: string } | null) {
  if (error) throw new Error(`${operation} failed. Please try again.`);
}
const statusValues: OrderStatus[] = [
  "New",
  "Accepted",
  "Preparing",
  "Ready to Serve",
  "Out for Delivery",
  "Completed",
  "Cancelled"
];

export async function updateOrderStatusAction(formData: FormData) {
  const session = await requireRestaurantAdmin();
  const orderId = stringValue(formData, "order_id");
  const status = stringValue(formData, "status") as OrderStatus;
  const reason = limitedStringValue(formData, "reason", 300);
  const restaurant = session.restaurant;
  const supabase = getSupabaseAdmin();

  if (!restaurant || !orderId || !statusValues.includes(status)) {
    return;
  }

  if (supabase) {
    const { data: updatedOrderId, error } = await supabase.rpc(
      "transition_order_status_async",
      {
        event_actor_role: session.role,
        event_actor_user_id: session.userId,
        event_reason: reason || null,
        target_order_id: orderId,
        target_restaurant_id: restaurant.id,
        target_status: status
      }
    );
    databaseFailure("Order status update", error);

    if (!updatedOrderId) {
      throw new Error("This order could not be updated. Refresh and try again.");
    }

    scheduleOrderNotifications(restaurant.id);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/shifts");
}

export async function recordOrderPrintEventsAction(
  orderId: string,
  events: Array<{ kind: "kot" | "receipt"; isReprint: boolean }>,
  deviceLabel: string
) {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();
  const safeEvents = events
    .filter((event) => event.kind === "kot" || event.kind === "receipt")
    .slice(0, 2);

  if (!supabase || !orderId || safeEvents.length === 0) {
    return { ok: false as const, error: "Print tracking is unavailable." };
  }

  for (const event of safeEvents) {
    const { error } = await supabase.rpc("record_order_print_event", {
      event_actor_role: session.role,
      event_actor_user_id: session.userId,
      event_device_label: deviceLabel.slice(0, 160),
      event_is_reprint: event.isReprint,
      target_order_id: orderId,
      target_print_kind: event.kind,
      target_restaurant_id: session.restaurantId
    });

    if (error) {
      console.error("WhatsOrder print event persistence failed", {
        code: error.code,
        orderId,
        restaurantId: session.restaurantId
      });
      return {
        ok: false as const,
        error: "The print opened, but tracking could not be saved."
      };
    }
  }

  return { ok: true as const };
}
