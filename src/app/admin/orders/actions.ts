"use server";

import { revalidatePath } from "next/cache";
import { getMenu, getMenuOffers } from "@/lib/data";
import { verifyCartAgainstMenu } from "@/lib/order-pricing";
import { isValidCustomerPhone, parseAndValidateCart } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import type { FulfilmentType, OrderStatus, PaymentMethod } from "@/lib/types";

export type StaffOrderState = {
  error?: string;
  success?: string;
};

// Counter staff handle walk-in (takeaway) and dine-in tickets. Delivery and
// car pickup remain customer self-service flows.
const staffFulfilmentTypes: FulfilmentType[] = ["takeaway", "dine_in"];

// How the punch screen's buttons map to the new order. "kitchen" sends an
// unpaid ticket to the kitchen (payment collected later, at completion); the
// "paid now" shortcuts complete a prepaid sale immediately. The payment_method
// values reuse the existing enum (shown to staff as Cash/Card) so the shift
// cash summary keeps aggregating correctly.
const staffOrderActions: Record<
  string,
  { status: OrderStatus; paymentMethod: PaymentMethod | null }
> = {
  kitchen: { status: "Preparing", paymentMethod: null },
  paid_cash: { status: "Completed", paymentMethod: "Cash on Delivery" },
  paid_card: { status: "Completed", paymentMethod: "Card on Delivery" }
};

function field(formData: FormData, key: string, maxLength: number) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

export async function createStaffOrderAction(
  _previousState: StaffOrderState,
  formData: FormData
): Promise<StaffOrderState> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return { error: "Order service is unavailable." };
  }

  let items;

  try {
    items = parseAndValidateCart(String(formData.get("items") ?? ""));
  } catch {
    return { error: "The order items could not be read. Please rebuild the ticket." };
  }

  if (items.length === 0) {
    return { error: "Add at least one item to the order." };
  }

  // Prices are re-verified against the live menu — never trusted from the form.
  const [menu, offers] = await Promise.all([
    getMenu(session.restaurantId, { admin: true }),
    getMenuOffers(session.restaurantId, { admin: true })
  ]);
  const verified = verifyCartAgainstMenu(items, menu, offers);

  if (!verified.ok) {
    return { error: verified.error };
  }

  const fulfilmentType = field(formData, "fulfilment_type", 30) as FulfilmentType;

  if (!staffFulfilmentTypes.includes(fulfilmentType)) {
    return { error: "Choose takeaway or dine-in." };
  }

  const tableNumber = field(formData, "table_number", 40);

  if (fulfilmentType === "dine_in" && !tableNumber) {
    return { error: "Enter a table number for dine-in orders." };
  }

  const orderAction = staffOrderActions[field(formData, "action", 20)];

  if (!orderAction) {
    return { error: "Choose how to save the order." };
  }

  const customerName = field(formData, "customer_name", 120) || "Walk-in customer";
  const customerPhone = field(formData, "customer_phone", 24);

  if (customerPhone && !isValidCustomerPhone(customerPhone)) {
    return { error: "Enter a valid phone number, or leave it blank." };
  }

  const notes = field(formData, "notes", 1000);
  const subtotal = verified.subtotal;
  const total = subtotal;

  // Attach the open shift if one exists. The shift cash summary only counts
  // Completed orders, so an unpaid "send to kitchen" ticket will not affect
  // cash until it is completed and paid.
  const { data: openShift } = await supabase
    .from("restaurant_shifts")
    .select("id")
    .eq("restaurant_id", session.restaurantId)
    .eq("status", "open")
    .maybeSingle();

  const ticketSummary = verified.items
    .map((item) => `${item.quantity}x ${item.name}`)
    .join(", ");

  const { error } = await supabase.from("orders").insert({
    restaurant_id: session.restaurantId,
    customer_name: customerName,
    customer_phone: customerPhone,
    fulfilment_type: fulfilmentType,
    table_number: fulfilmentType === "dine_in" ? tableNumber : null,
    delivery_area: "",
    delivery_address: "",
    notes: notes || null,
    // Empty until collected. Counter tickets sent to the kitchen are paid at
    // completion; "paid now" sales carry the method immediately.
    payment_method: orderAction.paymentMethod,
    items: verified.items,
    subtotal,
    delivery_fee: 0,
    total,
    status: orderAction.status,
    source: "staff",
    shift_id: openShift?.id ?? null,
    whatsapp_message: ticketSummary,
    consent_order_processing: true,
    consent_marketing: false,
    consent_timestamp: new Date().toISOString()
  });

  if (error) {
    console.error("WhatsOrder staff order creation failed", {
      code: error.code,
      message: error.message,
      restaurantId: session.restaurantId
    });
    return { error: "The order could not be saved. Please try again." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/shifts");

  return {
    success:
      orderAction.status === "Completed"
        ? "Order saved and marked paid."
        : "Order sent to the kitchen."
  };
}

const collectablePaymentMethods: PaymentMethod[] = [
  "Cash on Delivery",
  "Card on Delivery"
];

// Completes an unpaid ticket by recording how the customer paid. The payment
// method is set first, then the order transitions to Completed through the same
// audited RPC the normal status flow uses.
export async function collectPaymentAndCompleteAction(formData: FormData) {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();
  const orderId = field(formData, "order_id", 80);
  const paymentMethod = field(formData, "payment_method", 30) as PaymentMethod;

  if (!supabase || !orderId) {
    return;
  }

  if (!collectablePaymentMethods.includes(paymentMethod)) {
    throw new Error("Choose Cash or Card to complete this order.");
  }

  const { error: paymentError } = await supabase
    .from("orders")
    .update({ payment_method: paymentMethod })
    .eq("id", orderId)
    .eq("restaurant_id", session.restaurantId)
    .is("payment_method", null);

  if (paymentError) {
    throw new Error("The payment could not be recorded. Try again.");
  }

  const { data: completedOrderId, error: statusError } = await supabase.rpc(
    "transition_order_status_and_record_event",
    {
      event_actor_role: session.role,
      event_actor_user_id: session.userId,
      event_reason: null,
      target_order_id: orderId,
      target_restaurant_id: session.restaurantId,
      target_status: "Completed"
    }
  );

  if (statusError) {
    throw new Error(`Order completion failed: ${statusError.message}`);
  }

  if (!completedOrderId) {
    throw new Error("This order could not be completed. Refresh and try again.");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/shifts");
}
