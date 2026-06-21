"use server";

import { revalidatePath } from "next/cache";
import { getMenu, getMenuOffers } from "@/lib/data";
import { verifyCartAgainstMenu } from "@/lib/order-pricing";
import { isValidCustomerPhone, parseAndValidateCart } from "@/lib/security";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import type { FulfilmentType, PaymentMethod } from "@/lib/types";

export type StaffOrderState = {
  error?: string;
  success?: string;
};

// Counter staff handle walk-in (takeaway) and dine-in tickets. Delivery and
// car pickup remain customer self-service flows.
const staffFulfilmentTypes: FulfilmentType[] = ["takeaway", "dine_in"];
// Reuses the existing payment_method enum values, shown to staff as Cash/Card,
// so the shift cash summary keeps aggregating correctly.
const staffPaymentMethods: PaymentMethod[] = ["Cash on Delivery", "Card on Delivery"];

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

  const paymentMethod = field(formData, "payment_method", 30) as PaymentMethod;

  if (!staffPaymentMethods.includes(paymentMethod)) {
    return { error: "Choose Cash or Card." };
  }

  const customerName = field(formData, "customer_name", 120) || "Walk-in customer";
  const customerPhone = field(formData, "customer_phone", 24);

  if (customerPhone && !isValidCustomerPhone(customerPhone)) {
    return { error: "Enter a valid phone number, or leave it blank." };
  }

  const notes = field(formData, "notes", 1000);
  const markCompleted = String(formData.get("complete") ?? "") === "true";
  const status = markCompleted ? "Completed" : "New";
  const subtotal = verified.subtotal;
  const total = subtotal;

  // Attach the open shift if one exists. The shift cash summary only counts
  // Completed orders, so a "send to kitchen" order will not inflate cash until
  // it is completed.
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
    payment_method: paymentMethod,
    items: verified.items,
    subtotal,
    delivery_fee: 0,
    total,
    status,
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
    success: markCompleted
      ? "Order saved and marked completed."
      : "Order sent to the kitchen."
  };
}
