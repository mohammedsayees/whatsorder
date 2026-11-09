"use server";

import { revalidatePath } from "next/cache";

import { buildRiderAssignmentMessage } from "@/lib/rider-assignment";
import { sendRiderWhatsApp } from "@/lib/rider-whatsapp";
import { requireRestaurantAdmin, requireRestaurantRole } from "@/lib/super-admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeCustomerPhone } from "@/lib/whatsapp";
import type { DeliveryRider, Order } from "@/lib/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function field(formData: FormData, key: string, maxLength: number) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

export type RiderDirectoryState = {
  error?: string;
  success?: string;
};

export async function createDeliveryRiderAction(
  _previousState: RiderDirectoryState,
  formData: FormData
): Promise<RiderDirectoryState> {
  const session = await requireRestaurantRole([
    "restaurant_admin",
    "owner",
    "manager"
  ]);
  const admin = getSupabaseAdmin();
  const name = field(formData, "name", 120);
  const phone = normalizeCustomerPhone(
    field(formData, "phone", 30),
    session.restaurant.phone_country_code
  );

  if (!admin) return { error: "Rider directory is unavailable." };
  if (!name) return { error: "Enter the rider's name." };
  if (!/^\d{7,15}$/.test(phone)) {
    return { error: "Enter a valid WhatsApp number with country code." };
  }

  const { error } = await admin.from("delivery_riders").insert({
    restaurant_id: session.restaurantId,
    name,
    phone,
    created_by_user_id: session.userId
  });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "That rider WhatsApp number is already in the directory."
          : "The rider could not be added. Please try again."
    };
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/orders");
  return { success: `${name} added to the rider directory.` };
}

export async function setDeliveryRiderActiveAction(formData: FormData) {
  const session = await requireRestaurantRole([
    "restaurant_admin",
    "owner",
    "manager"
  ]);
  const admin = getSupabaseAdmin();
  const riderId = field(formData, "rider_id", 80);
  const isActive = field(formData, "is_active", 10) === "true";
  if (!admin || !UUID_PATTERN.test(riderId)) return;

  const { error } = await admin
    .from("delivery_riders")
    .update({ is_active: isActive })
    .eq("id", riderId)
    .eq("restaurant_id", session.restaurantId);
  if (error) throw new Error("The rider status could not be updated.");

  revalidatePath("/admin/settings");
  revalidatePath("/admin/orders");
}

export type AssignRiderState = {
  error?: string;
  success?: string;
  warning?: string;
};

function deliveryWarning(reason: string) {
  if (reason === "no_open_service_window") {
    return "Rider assigned, but WhatsApp could not send because the Cloud API has no open 24-hour window. Ask the rider to message the restaurant once, or use an active WhatsApp Web connection, then resend.";
  }
  return "Rider assigned, but WhatsApp did not accept the message. Check the connection and resend.";
}

export async function assignRiderToOrderAction(
  _previousState: AssignRiderState,
  formData: FormData
): Promise<AssignRiderState> {
  const session = await requireRestaurantAdmin();
  const admin = getSupabaseAdmin();
  const orderId = field(formData, "order_id", 80);
  const riderId = field(formData, "rider_id", 80);

  if (!admin) return { error: "Rider assignment is unavailable." };
  if (!UUID_PATTERN.test(orderId) || !UUID_PATTERN.test(riderId)) {
    return { error: "Choose a valid rider and refresh the order board." };
  }

  const [orderResult, riderResult] = await Promise.all([
    admin
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .eq("restaurant_id", session.restaurantId)
      .maybeSingle(),
    admin
      .from("delivery_riders")
      .select("id, restaurant_id, name, phone, is_active, created_at")
      .eq("id", riderId)
      .eq("restaurant_id", session.restaurantId)
      .maybeSingle()
  ]);

  const order = orderResult.data as Order | null;
  const rider = riderResult.data as DeliveryRider | null;
  if (orderResult.error || !order) return { error: "Delivery order not found." };
  if (riderResult.error || !rider?.is_active) {
    return { error: "That rider is no longer active." };
  }
  if (order.fulfilment_type !== "delivery") {
    return { error: "Riders can only be assigned to delivery orders." };
  }
  if (["Completed", "Cancelled"].includes(order.status)) {
    return { error: "This order is already closed and cannot be assigned." };
  }

  const assignment = await admin
    .from("order_rider_assignments")
    .insert({
      restaurant_id: session.restaurantId,
      order_id: order.id,
      rider_id: rider.id,
      assigned_by_user_id: session.userId,
      delivery_status: "sending"
    })
    .select("id")
    .single();
  if (assignment.error || !assignment.data) {
    return { error: "The rider assignment could not be saved." };
  }

  const message = buildRiderAssignmentMessage({
    order,
    restaurant: session.restaurant,
    rider
  });
  let delivery: Awaited<ReturnType<typeof sendRiderWhatsApp>>;
  try {
    delivery = await sendRiderWhatsApp({
      restaurantId: session.restaurantId,
      phone: rider.phone,
      phoneCountryCode: session.restaurant.phone_country_code,
      message
    });
  } catch (error) {
    console.error("Rider assignment WhatsApp failed", {
      restaurantId: session.restaurantId,
      orderId: order.id,
      riderId: rider.id,
      message: error instanceof Error ? error.message : "unknown"
    });
    delivery = {
      delivered: false,
      reason: "transport_failed",
      messageId: null
    };
  }

  const saved = await admin
    .from("order_rider_assignments")
    .update({
      delivery_status: delivery.delivered
        ? "accepted"
        : delivery.reason === "no_open_service_window"
          ? "skipped"
          : "failed",
      delivery_reason: delivery.reason,
      transport_message_id: delivery.messageId
    })
    .eq("id", assignment.data.id)
    .eq("restaurant_id", session.restaurantId);
  if (saved.error) {
    console.error("Rider assignment outcome could not be recorded", {
      restaurantId: session.restaurantId,
      assignmentId: assignment.data.id
    });
  }

  revalidatePath("/admin/orders");
  return delivery.delivered
    ? { success: `${rider.name} assigned. WhatsApp accepted the delivery details.` }
    : { warning: deliveryWarning(delivery.reason) };
}
