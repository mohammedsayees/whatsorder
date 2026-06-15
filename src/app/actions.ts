"use server";

import { revalidatePath } from "next/cache";
import { getMenu, getRestaurantBySlug } from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildWhatsAppMessage, buildWhatsAppUrl } from "@/lib/whatsapp";
import type { CartLine, OrderStatus, PaymentMethod } from "@/lib/types";

type CreateOrderResult =
  | { ok: true; orderId: string; whatsappUrl: string }
  | { ok: false; error: string };

const statusValues: OrderStatus[] = [
  "New",
  "Accepted",
  "Preparing",
  "Out for Delivery",
  "Completed",
  "Cancelled"
];

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function parseCart(raw: string): CartLine[] {
  const parsed = JSON.parse(raw) as CartLine[];

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((item) => item.item_id && item.name && item.quantity > 0 && item.price >= 0)
    .map((item) => ({
      item_id: String(item.item_id),
      name: String(item.name),
      quantity: Number(item.quantity),
      price: Number(item.price)
    }));
}

export async function createOrderAction(
  restaurantSlug: string,
  formData: FormData
): Promise<CreateOrderResult> {
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    return { ok: false, error: "Restaurant not found." };
  }

  let items: CartLine[] = [];

  try {
    items = parseCart(stringValue(formData, "items"));
  } catch {
    return { ok: false, error: "Your cart could not be read. Please refresh and try again." };
  }

  if (items.length === 0) {
    return { ok: false, error: "Your cart is empty." };
  }

  const customerName = stringValue(formData, "customer_name");
  const customerPhone = stringValue(formData, "customer_phone");
  const deliveryArea = stringValue(formData, "delivery_area");
  const deliveryAddress = stringValue(formData, "delivery_address");
  const notes = stringValue(formData, "notes");
  const paymentMethod = stringValue(formData, "payment_method") as PaymentMethod;
  const consentOrderProcessing = formData.get("consent_order_processing") === "on";
  const consentMarketing = formData.get("consent_marketing") === "on";

  if (!customerName || !customerPhone || !deliveryArea || !deliveryAddress) {
    return { ok: false, error: "Please complete your contact and delivery details." };
  }

  if (!["Cash on Delivery", "Card on Delivery"].includes(paymentMethod)) {
    return { ok: false, error: "Please choose a payment method." };
  }

  if (!consentOrderProcessing) {
    return { ok: false, error: "Please accept order processing consent to continue." };
  }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (subtotal < restaurant.minimum_order_amount) {
    return {
      ok: false,
      error: `Minimum order amount is AED ${restaurant.minimum_order_amount}.`
    };
  }

  const total = subtotal + restaurant.delivery_fee;
  // Future payment gateway support can reserve an unpaid payment intent here before WhatsApp opens.
  const message = buildWhatsAppMessage({
    restaurant,
    customerName,
    customerPhone,
    deliveryArea,
    deliveryAddress,
    notes,
    paymentMethod,
    items,
    subtotal,
    deliveryFee: restaurant.delivery_fee,
    total
  });
  const consentTimestamp = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  let orderId = `WO-${Date.now()}`;

  if (supabase) {
    const { data, error } = await supabase
      .from("orders")
      .insert({
        restaurant_id: restaurant.id,
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_area: deliveryArea,
        delivery_address: deliveryAddress,
        notes: notes || null,
        payment_method: paymentMethod,
        items,
        subtotal,
        delivery_fee: restaurant.delivery_fee,
        total,
        status: "New",
        whatsapp_message: message,
        consent_order_processing: consentOrderProcessing,
        consent_marketing: consentMarketing,
        consent_timestamp: consentTimestamp
      })
      .select("id")
      .single();

    if (error) {
      return { ok: false, error: error.message };
    }

    orderId = String(data.id);

    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id,total_orders,total_spend")
      .eq("restaurant_id", restaurant.id)
      .eq("phone", customerPhone)
      .maybeSingle();

    if (existingCustomer) {
      await supabase
        .from("customers")
        .update({
          name: customerName,
          delivery_area: deliveryArea,
          delivery_address: deliveryAddress,
          total_orders: Number(existingCustomer.total_orders ?? 0) + 1,
          total_spend: Number(existingCustomer.total_spend ?? 0) + total,
          marketing_opt_in: consentMarketing,
          updated_at: consentTimestamp
        })
        .eq("id", existingCustomer.id);
    } else {
      await supabase.from("customers").insert({
        restaurant_id: restaurant.id,
        name: customerName,
        phone: customerPhone,
        delivery_area: deliveryArea,
        delivery_address: deliveryAddress,
        total_orders: 1,
        total_spend: total,
        marketing_opt_in: consentMarketing,
        updated_at: consentTimestamp
      });
    }
  }

  revalidatePath(`/r/${restaurant.slug}`);
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/customers");

  return {
    ok: true,
    // Future WhatsApp Business API support can replace this click-to-WhatsApp URL with a template send.
    orderId,
    whatsappUrl: buildWhatsAppUrl(restaurant.whatsapp_number, message)
  };
}

export async function updateOrderStatusAction(formData: FormData) {
  const orderId = stringValue(formData, "order_id");
  const status = stringValue(formData, "status") as OrderStatus;
  const supabase = getSupabaseAdmin();

  if (!orderId || !statusValues.includes(status)) {
    return;
  }

  if (supabase) {
    await supabase
      .from("orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", orderId);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
}

export async function addMenuItemAction(formData: FormData) {
  const restaurantSlug = process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG ?? "chaixpress";
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  const supabase = getSupabaseAdmin();

  if (!restaurant || !supabase) {
    return;
  }

  await supabase.from("menu_items").insert({
    restaurant_id: restaurant.id,
    category_id: stringValue(formData, "category_id"),
    name: stringValue(formData, "name"),
    description: stringValue(formData, "description") || null,
    price: Number(stringValue(formData, "price")),
    image_url: stringValue(formData, "image_url") || null,
    is_available: formData.get("is_available") === "on",
    is_featured: formData.get("is_featured") === "on"
  });

  revalidatePath("/admin/menu");
  revalidatePath(`/r/${restaurant.slug}`);
}

export async function updateMenuItemAction(formData: FormData) {
  const itemId = stringValue(formData, "item_id");
  const restaurantSlug = process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG ?? "chaixpress";
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  const supabase = getSupabaseAdmin();

  if (!restaurant || !supabase || !itemId) {
    return;
  }

  await supabase
    .from("menu_items")
    .update({
      name: stringValue(formData, "name"),
      description: stringValue(formData, "description") || null,
      price: Number(stringValue(formData, "price")),
      category_id: stringValue(formData, "category_id"),
      image_url: stringValue(formData, "image_url") || null,
      is_available: formData.get("is_available") === "on",
      is_featured: formData.get("is_featured") === "on"
    })
    .eq("id", itemId)
    .eq("restaurant_id", restaurant.id);

  revalidatePath("/admin/menu");
  revalidatePath(`/r/${restaurant.slug}`);
}

export async function deleteMenuItemAction(formData: FormData) {
  const itemId = stringValue(formData, "item_id");
  const restaurantSlug = process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG ?? "chaixpress";
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  const supabase = getSupabaseAdmin();

  if (!restaurant || !supabase || !itemId) {
    return;
  }

  await supabase.from("menu_items").delete().eq("id", itemId).eq("restaurant_id", restaurant.id);

  revalidatePath("/admin/menu");
  revalidatePath(`/r/${restaurant.slug}`);
}

export async function updateRestaurantSettingsAction(formData: FormData) {
  const restaurantSlug = process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG ?? "chaixpress";
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  const supabase = getSupabaseAdmin();

  if (!restaurant || !supabase) {
    return;
  }

  await supabase
    .from("restaurants")
    .update({
      name: stringValue(formData, "name"),
      whatsapp_number: stringValue(formData, "whatsapp_number"),
      address: stringValue(formData, "address") || null,
      delivery_fee: Number(stringValue(formData, "delivery_fee")),
      minimum_order_amount: Number(stringValue(formData, "minimum_order_amount")),
      is_active: formData.get("is_active") === "on"
    })
    .eq("id", restaurant.id);

  revalidatePath("/admin/settings");
  revalidatePath(`/r/${restaurant.slug}`);
}

export async function addCategoryAction(formData: FormData) {
  const restaurantSlug = process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG ?? "chaixpress";
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  const menu = restaurant ? await getMenu(restaurant.id) : null;
  const supabase = getSupabaseAdmin();

  if (!restaurant || !menu || !supabase) {
    return;
  }

  await supabase.from("menu_categories").insert({
    restaurant_id: restaurant.id,
    name: stringValue(formData, "name"),
    display_order: menu.categories.length + 1,
    is_active: true
  });

  revalidatePath("/admin/menu");
  revalidatePath(`/r/${restaurant.slug}`);
}
