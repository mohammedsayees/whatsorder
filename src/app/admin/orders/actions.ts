"use server";

import { revalidatePath } from "next/cache";
import { formatOrderItemName } from "@/lib/cart-line";
import { getMenu, getMenuOffers, getMenuOptionCatalog } from "@/lib/data";
import { scheduleOrderNotifications } from "@/lib/notification-jobs";
import { isFulfilmentEnabled } from "@/lib/fulfilment";
import {
  verifyCartAgainstMenu,
  verifyCombinedOfferLimits
} from "@/lib/order-pricing";
import { isValidCustomerPhone, parseAndValidateCart } from "@/lib/security";
import {
  clampPunchedAt,
  isClientOrderId,
  isDuplicateClientOrderError,
  isStaffOrderActionKind,
  payloadField,
  type StaffOrderPayload
} from "@/lib/staff-order-payload";
import { getSupabaseAdmin } from "@/lib/supabase";
import { normalizeCustomerPhone } from "@/lib/whatsapp";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import type {
  CartLine,
  FulfilmentType,
  Order,
  OrderStatus,
  PaymentMethod
} from "@/lib/types";

export type StaffOrderState = {
  retryUnchanged?: boolean;
  error?: string;
  mode?: "amended" | "add_on";
  success?: string;
  // The saved order, returned so the punch screen can print its KOT/receipt
  // without navigating away. Absent on errors.
  order?: Order;
};

export type AddOrderItemsPayload = {
  clientOrderId: string;
  items: unknown[];
  note?: string;
};

// How the punch screen's buttons map to the new order. "kitchen" sends an
// unpaid ticket to the kitchen (payment collected later, at completion); the
// "paid now" shortcuts complete a prepaid sale immediately. The payment_method
// values reuse the existing enum (shown to staff as Cash/Card) so the shift
// cash summary keeps aggregating correctly. "paid_credit" inserts the order
// unpaid and then charges the credit ledger through record_customer_credit_order,
// the same locked RPC used when completing from the orders list, so the
// credit-limit check and ledger entry live in one transaction.
const staffOrderActions: Record<
  string,
  { status: OrderStatus; paymentMethod: PaymentMethod | null }
> = {
  kitchen: { status: "Preparing", paymentMethod: null },
  paid_cash: { status: "Completed", paymentMethod: "Cash on Delivery" },
  paid_card: { status: "Completed", paymentMethod: "Card on Delivery" },
  paid_upi: { status: "Completed", paymentMethod: "UPI" },
  paid_credit: { status: "Preparing", paymentMethod: null }
};

const creditChargeErrors: Record<string, string> = {
  "Customer credit limit exceeded": "the customer's credit limit would be exceeded",
  "Customer credit is not enabled": "credit is disabled for this customer",
  "Customer profile not found": "the customer profile was not found",
  "Cannot collect payment in a closed shift": "the order's shift is already closed",
  "A different payment method is already recorded": "a different payment method is already recorded"
};

// Charges a punched order to the attached customer's credit account. Safe to
// repeat: the RPC returns changed=false once the charge exists, so an outbox
// replay of a paid_credit order finishes a charge an earlier attempt missed.
async function chargeStaffOrderToCredit(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  session: { restaurantId: string; userId: string },
  order: Order
): Promise<StaffOrderState> {
  if (order.payment_method === "Customer Credit") {
    return { success: "Order saved to Customer Credit.", order };
  }
  const { data, error } = await supabase.rpc("record_customer_credit_order", {
    target_restaurant_id: session.restaurantId,
    target_order_id: order.id,
    event_actor_user_id: session.userId
  });
  if (error || !data?.order_id) {
    const known = Object.keys(creditChargeErrors).find((message) =>
      error?.message?.includes(message)
    );
    if (!known) {
      // Transient failure: the order exists unpaid; an unchanged retry
      // resolves it via client_order_id and charges it then.
      return {
        retryUnchanged: true,
        error: "The order reached the kitchen, but Customer Credit could not be recorded yet. Retry this unchanged ticket."
      };
    }
    // A business rule refused the charge. The order is real and in the
    // kitchen, so report it as saved and leave payment for the orders list.
    return {
      success: `Sent to the kitchen unpaid — Customer Credit was not recorded because ${creditChargeErrors[known]}. Collect payment from Orders.`,
      order
    };
  }
  const { data: charged } = await supabase
    .from("orders")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .eq("id", order.id)
    .maybeSingle();
  if (data.changed) scheduleOrderNotifications(session.restaurantId);
  return {
    success: "Order saved and charged to Customer Credit.",
    order: (charged as Order | null) ?? order
  };
}

function field(formData: FormData, key: string, maxLength: number) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

// Single entry point for punched orders: the punch screen calls it live, and
// the device outbox replays the identical payload after an outage. The
// client_order_id unique index makes replays idempotent, so a retry can never
// double-punch an order.
export async function submitStaffOrderAction(
  payload: StaffOrderPayload
): Promise<StaffOrderState> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return { retryUnchanged: true, error: "Order service is unavailable." };
  }

  // A queued order from a device whose login has since switched restaurants
  // must never sync into the wrong tenant.
  if (payload?.restaurantId !== session.restaurantId) {
    return { error: "This order was punched under a different restaurant login." };
  }

  if (!isClientOrderId(payload.clientOrderId)) {
    return { error: "The order could not be read. Please rebuild the ticket." };
  }

  // Resolve a replay before mutable menu/fulfilment validation. A saved order
  // remains successful even when its original response was lost and the menu changed.
  const findSavedOrder = () => supabase
    .from("orders")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .eq("client_order_id", payload.clientOrderId)
    .maybeSingle();
  const existing = await findSavedOrder();
  if (existing.error) {
    return { retryUnchanged: true, error: "The previous order attempt could not be checked. Please retry." };
  }
  if (existing.data) {
    if (payload.action === "paid_credit") {
      return chargeStaffOrderToCredit(supabase, session, existing.data as Order);
    }
    return { success: "Order already synced.", order: existing.data as Order };
  }

  const selectedCustomerId = payloadField(payload.customerId, 80);
  let selectedCustomer: { id: string; name: string; phone: string } | null = null;
  if (selectedCustomerId) {
    if (!isClientOrderId(selectedCustomerId)) {
      return { error: "The selected credit customer could not be read. Select the customer again." };
    }
    const [customerResult, accountResult] = await Promise.all([
      supabase
        .from("customers")
        .select("id, name, phone")
        .eq("restaurant_id", session.restaurantId)
        .eq("id", selectedCustomerId)
        .maybeSingle(),
      supabase
        .from("customer_credit_accounts")
        .select("customer_id")
        .eq("restaurant_id", session.restaurantId)
        .eq("customer_id", selectedCustomerId)
        .maybeSingle()
    ]);
    if (customerResult.error || accountResult.error) {
      return {
        retryUnchanged: true,
        error: "The selected credit customer could not be verified. Please retry."
      };
    }
    if (!customerResult.data || !accountResult.data) {
      return {
        error:
          "The selected credit customer is no longer available. Clear the customer and select again."
      };
    }
    selectedCustomer = customerResult.data;
  }

  let items;

  try {
    items = parseAndValidateCart(JSON.stringify(payload.items ?? []));
  } catch {
    return { error: "The order items could not be read. Please rebuild the ticket." };
  }

  if (items.length === 0) {
    return { error: "Add at least one item to the order." };
  }

  // Prices are re-verified against the live menu — never trusted from the
  // device. A queued order punched against a stale cached menu still gets the
  // current server-side price check at sync time.
  const [menu, offers, optionCatalog] = await Promise.all([
    getMenu(session.restaurantId, { admin: true }),
    getMenuOffers(session.restaurantId, { admin: true }),
    getMenuOptionCatalog(session.restaurantId, { admin: true })
  ]);

  const verified = verifyCartAgainstMenu(items, menu, offers, optionCatalog);

  if (!verified.ok) {
    return { error: verified.error };
  }

  const fulfilmentType = payloadField(payload.fulfilmentType, 30) as FulfilmentType;

  // Mirror the customer checkout: only accept channels this restaurant offers.
  if (!isFulfilmentEnabled(session.restaurant, fulfilmentType)) {
    return { error: "That order type is not available for this restaurant." };
  }

  const tableNumber = payloadField(payload.tableNumber, 40);
  const deliveryArea = payloadField(payload.deliveryArea, 120);
  const deliveryAddress = payloadField(payload.deliveryAddress, 500);
  const deliveryLandmark = payloadField(payload.deliveryLandmark, 250);
  const carPlateNumber = payloadField(payload.carPlateNumber, 40);
  const carDescription = payloadField(payload.carDescription, 120);

  if (fulfilmentType === "dine_in" && !tableNumber) {
    return { error: "Enter a table number for dine-in orders." };
  }

  if (fulfilmentType === "car_pickup" && !carPlateNumber) {
    return { error: "Enter the car plate number for a bring-to-car order." };
  }

  if (fulfilmentType === "delivery" && (!deliveryArea || !deliveryAddress)) {
    return { error: "Enter the delivery area and address." };
  }

  if (!isStaffOrderActionKind(payload.action)) {
    return { error: "Choose how to save the order." };
  }

  if (payload.action === "paid_upi" && session.restaurant.country_code !== "IN") {
    return { error: "UPI is available only for restaurants in India." };
  }

  if (payload.action === "paid_credit" && !selectedCustomer) {
    return { error: "Select a credit customer before charging Customer Credit." };
  }

  const orderAction = staffOrderActions[payload.action];
  const customerName =
    selectedCustomer?.name ??
    (payloadField(payload.customerName, 120) || "Walk-in customer");
  const submittedCustomerPhone = payloadField(payload.customerPhone, 24);
  const customerPhone =
    selectedCustomer?.phone ??
    normalizeCustomerPhone(
      submittedCustomerPhone,
      session.restaurant.phone_country_code
    );

  if (!selectedCustomer && submittedCustomerPhone && !isValidCustomerPhone(customerPhone)) {
    return { error: "Enter a valid phone number, or leave it blank." };
  }

  const notes = payloadField(payload.notes, 1000);
  const subtotal = verified.subtotal;
  const deliveryFee =
    fulfilmentType === "delivery" ? Number(session.restaurant.delivery_fee) || 0 : 0;
  const total = subtotal + deliveryFee;

  // The database resolves and locks the shift at punched_at during insertion.
  // Looking up the current shift here races closure and misattributes replays.

  const ticketSummary = verified.items
    .map((item) => `${item.quantity}x ${formatOrderItemName(item)}`)
    .join(", ");

  const isDelivery = fulfilmentType === "delivery";
  const { data: insertedOrder, error } = await supabase
    .from("orders")
    .insert({
      restaurant_id: session.restaurantId,
      client_order_id: payload.clientOrderId,
      punched_at: clampPunchedAt(payload.punchedAt),
      customer_id: selectedCustomer?.id ?? null,
      customer_name: customerName,
      customer_phone: customerPhone,
      fulfilment_type: fulfilmentType,
      table_number: fulfilmentType === "dine_in" ? tableNumber : null,
      car_plate_number: fulfilmentType === "car_pickup" ? carPlateNumber : null,
      car_description: fulfilmentType === "car_pickup" ? carDescription || null : null,
      delivery_area: isDelivery ? deliveryArea : "",
      delivery_address: isDelivery ? deliveryAddress : "",
      delivery_landmark: isDelivery ? deliveryLandmark || null : null,
      notes: notes || null,
      // Empty until collected. Counter tickets sent to the kitchen are paid at
      // completion; "paid now" sales carry the method immediately.
      payment_method: orderAction.paymentMethod,
      items: verified.items,
      subtotal,
      delivery_fee: deliveryFee,
      total,
      status: orderAction.status,
      source: "staff",

      whatsapp_message: ticketSummary,
      consent_order_processing: true,
      consent_marketing: false,
      consent_timestamp: new Date().toISOString()
    })
    // Return the saved row so the punch screen can print it immediately.
    .select("*")
    .single();

  if (error) {
    // A replay of an order that already landed (e.g. the first attempt timed
    // out on slow internet after the insert succeeded) is a success, not a
    // failure — the outbox can safely drop it.
    if (isDuplicateClientOrderError(error)) {
      const saved = await findSavedOrder();
      if (saved.error || !saved.data) {
        return { retryUnchanged: true, error: "The saved order could not be loaded. Please retry." };
      }
      if (payload.action === "paid_credit") {
        return chargeStaffOrderToCredit(supabase, session, saved.data as Order);
      }
      return { success: "Order already synced.", order: saved.data as Order };
    }

    console.error("WhatsOrder staff order creation failed", {
      code: error.code,
      message: error.message,
      restaurantId: session.restaurantId
    });
    return { retryUnchanged: true, error: "The order could not be saved. Please try again." };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/shifts");

  if (payload.action === "paid_credit" && insertedOrder) {
    return chargeStaffOrderToCredit(supabase, session, insertedOrder as Order);
  }

  return {
    success:
      orderAction.status === "Completed"
        ? "Order saved and marked paid."
        : "Order sent to the kitchen.",
    order: (insertedOrder as Order | null) ?? undefined
  };
}

export async function addItemsToOrderAction(
  orderId: string,
  payload: AddOrderItemsPayload
): Promise<StaffOrderState> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return { retryUnchanged: true, error: "Order service is unavailable." };
  }

  if (!orderId || !isClientOrderId(payload?.clientOrderId)) {
    return { error: "The order addition could not be read. Please try again." };
  }

  // A restored add-on may already have landed. Resolve it before menu changes,
  // order completion or offer caps can reject a successful earlier attempt.
  const replay = await supabase.from("order_item_addition_events")
    .select("*").eq("restaurant_id", session.restaurantId)
    .eq("client_order_id", payload.clientOrderId).maybeSingle();
  if (replay.error) return { retryUnchanged: true, error: "The previous addition could not be checked. Retry this bill." };
  if (replay.data) {
    if (replay.data.parent_order_id !== orderId) return { retryUnchanged: true, error: "This attempt belongs to another order." };
    const saved = await supabase.from("orders").select("*").eq("restaurant_id", session.restaurantId).eq("id", replay.data.resulting_order_id).single();
    if (saved.error) return { retryUnchanged: true, error: "The saved addition could not be loaded. Retry." };
    revalidatePath("/admin/orders");
    return { success: "Items already added.", mode: replay.data.mode, order: {
      ...saved.data, items: replay.data.added_items, subtotal: Number(replay.data.added_subtotal), total: Number(replay.data.added_subtotal), delivery_fee: 0,
      notes: `ADD-ON ITEMS · Original #${orderId.slice(-8).toUpperCase()}`, payment_method: null, status: "Preparing", loyalty_discount: 0, points_earned: 0, points_redeemed: 0
    } as Order };
  }

  let items;
  try {
    items = parseAndValidateCart(JSON.stringify(payload?.items ?? []));
  } catch {
    return { error: "The added items could not be read. Please rebuild the ticket." };
  }

  if (items.length === 0) {
    return { error: "Add at least one item." };
  }

  const [originalOrderResult, menu, offers, optionCatalog] = await Promise.all([
    supabase
      .from("orders")
      .select("items,payment_method,status")
      .eq("restaurant_id", session.restaurantId)
      .eq("id", orderId)
      .maybeSingle(),
    getMenu(session.restaurantId, { admin: true }),
    getMenuOffers(session.restaurantId, { admin: true }),
    getMenuOptionCatalog(session.restaurantId, { admin: true })
  ]);

  if (originalOrderResult.error || !originalOrderResult.data) {
    return { error: "Order not found. Refresh the order board and try again." };
  }

  const verified = verifyCartAgainstMenu(items, menu, offers, optionCatalog);

  if (!verified.ok) {
    return { error: verified.error };
  }

  // The RPC appends to an active unpaid order. Enforce offer caps across the
  // whole amended ticket, not just this batch. Paid tickets become separate
  // add-on orders and therefore have their own offer allowance.
  if (
    originalOrderResult.data.payment_method === null &&
    originalOrderResult.data.status !== "Completed"
  ) {
    const combinedOfferLimits = verifyCombinedOfferLimits(
      (originalOrderResult.data.items ?? []) as CartLine[],
      verified.items,
      offers
    );

    if (!combinedOfferLimits.ok) {
      return { error: combinedOfferLimits.error };
    }
  }

  const { data, error } = await supabase.rpc("add_items_to_restaurant_order", {
    addition_client_order_id: payload.clientOrderId,
    addition_items: verified.items,
    addition_note: payloadField(payload.note, 900) || null,
    addition_subtotal: verified.subtotal,
    event_actor_role: session.role,
    event_actor_user_id: session.userId,
    target_order_id: orderId,
    target_restaurant_id: session.restaurantId
  });

  if (error) {
    const knownMessages = [
      "Order not found",
      "Items cannot be added to a cancelled order",
      "Items cannot be added to a completed unpaid order"
    ];
    return {
      retryUnchanged: !knownMessages.some(message => error.message.includes(message)),
      error:
        knownMessages.find((message) => error.message.includes(message)) ??
        "The items could not be added. Refresh and try again."
    };
  }

  const result = data as { mode?: "amended" | "add_on"; order?: Order } | null;
  const savedOrder = result?.order;
  const mode = result?.mode;

  if (!savedOrder || (mode !== "amended" && mode !== "add_on")) {
    return { retryUnchanged: true, error: "The items were saved, but the updated ticket could not be loaded." };
  }

  const originalReference = orderId.slice(-8).toUpperCase();
  const note = payloadField(payload.note, 900);
  const printOrder: Order = {
    ...savedOrder,
    delivery_fee: 0,
    items: verified.items,
    loyalty_discount: 0,
    notes: `ADD-ON ITEMS · Original #${originalReference}${note ? ` · ${note}` : ""}`,
    payment_method: null,
    points_earned: 0,
    points_redeemed: 0,
    status: "Preparing",
    subtotal: verified.subtotal,
    total: verified.subtotal
  };

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/shifts");

  return {
    mode,
    order: printOrder,
    success:
      mode === "amended"
        ? "Items added to the unpaid order. Print the add-on KOT."
        : "Payment was already recorded, so a separate unpaid add-on order was created."
  };
}

const collectablePaymentMethods: PaymentMethod[] = [
  "Cash on Delivery",
  "Card on Delivery",
  "UPI",
  "Customer Credit"
];

function isPaymentMethodAvailable(
  paymentMethod: PaymentMethod,
  countryCode: string | null | undefined
) {
  return (
    collectablePaymentMethods.includes(paymentMethod) &&
    (paymentMethod !== "UPI" || countryCode === "IN")
  );
}

// Payment, status, loyalty and audit are committed by one database transaction.
export async function collectPaymentAndCompleteAction(formData: FormData) {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();
  const orderId = field(formData, "order_id", 80);
  const paymentMethod = field(formData, "payment_method", 30) as PaymentMethod;

  if (!supabase || !orderId) {
    return;
  }

  if (!isPaymentMethodAvailable(paymentMethod, session.restaurant.country_code)) {
    throw new Error("Choose a payment method available for this restaurant.");
  }

  const { data, error } =
    paymentMethod === "Customer Credit"
      ? await supabase.rpc("record_customer_credit_order", {
          target_restaurant_id: session.restaurantId,
          target_order_id: orderId,
          event_actor_user_id: session.userId
        })
      : await supabase.rpc("record_order_payment_async", {
          target_restaurant_id: session.restaurantId,
          target_order_id: orderId,
          requested_payment_method: paymentMethod,
          complete_order: true,
          event_actor_user_id: session.userId
        });

  if (error || !data?.order_id) {
    throw new Error("Payment and order completion could not be saved. Refresh and try again.");
  }
  // A retry must not re-send the completion notification.
  if (!data.changed) {
    revalidatePath("/admin/orders");
    return;
  }

  scheduleOrderNotifications(session.restaurantId);

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/shifts");
}

export type ChangePaymentState = {
  error?: string;
  success?: string;
};

// Lets staff correct a mis-punched Cash/Card. Changes are audited in
// order_payment_events. Correcting an order in a CLOSED shift is restricted to
// managers/owners; the database then saves a new shift report version with the
// recalculated expected cash/card. Shifts in a closed business day are final.
export async function changeOrderPaymentMethodAction(
  _previousState: ChangePaymentState,
  formData: FormData
): Promise<ChangePaymentState> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();
  const orderId = field(formData, "order_id", 80);
  const newMethod = field(formData, "payment_method", 30) as PaymentMethod;

  if (!supabase || !orderId) {
    return { error: "Payment update is unavailable." };
  }

  if (
    newMethod === "Customer Credit" ||
    !isPaymentMethodAvailable(newMethod, session.restaurant.country_code)
  ) {
    return { error: "Choose a payment method available for this restaurant." };
  }

  const { data, error } = await supabase.rpc("record_order_payment_async", {
    target_restaurant_id: session.restaurantId,
    target_order_id: orderId,
    requested_payment_method: newMethod,
    complete_order: false,
    event_actor_user_id: session.userId
  });
  if (error || !data?.order_id) {
    const knownErrors = [
      "Order not found",
      "Set payment when completing the order",
      "Only management can correct a closed shift payment",
      "This shift belongs to a closed business day and can no longer be corrected",
      "Customer Credit must be corrected from the credit ledger"
    ];
    return { error: knownErrors.find((message) => error?.message.includes(message)) ??
      "The payment method could not be updated. Try again." };
  }
  if (!data.changed) return { success: "Payment method unchanged." };

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/shifts");

  return {
    success: `Payment changed to ${newMethod === "Cash on Delivery" ? "Cash" : newMethod === "UPI" ? "UPI" : "Card"}.`
  };
}
