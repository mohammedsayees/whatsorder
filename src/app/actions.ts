"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  getMenu,
  getMenuOffers,
  getMenuOptionCatalog,
  getRestaurantBySlug
} from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  buildWhatsAppAppUrl,
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  normalizeCustomerPhone,
  normalizeWhatsAppNumber
} from "@/lib/whatsapp";
import { getCustomerLanguage } from "@/lib/customer-i18n";
import {
  isRestaurantOpen,
  openingHoursFromFormData
} from "@/lib/opening-hours";
import {
  isValidCustomerPhone,
  parseAndValidateCart
} from "@/lib/security";
import { verifyCartAgainstMenu } from "@/lib/order-pricing";
import { revalidatePublicRestaurantCache } from "@/lib/public-cache";
import { loyaltyLineForOrder } from "@/lib/loyalty-progress";
import { sendOrderStatusNotification } from "@/lib/order-notifications";
import { isFulfilmentEnabled } from "@/lib/fulfilment";
import { evaluateDeliveryRange } from "@/lib/geo";
import { formatCurrency } from "@/lib/currency";
import { normalizeImageUpload } from "@/lib/server-image-upload";
import { configuredMarketplaceChannels } from "@/lib/shift-reconciliation";
import {
  requireRestaurantAdmin,
  requireRestaurantRole,
  requireSuperAdmin
} from "@/lib/super-admin-auth";
import type {
  CartLine,
  FulfilmentType,
  MenuCategory,
  OrderStatus,
  PaymentMethod
} from "@/lib/types";

type CreateOrderResult =
  | { ok: true; orderId: string; whatsappUrl: string; whatsappAppUrl: string }
  | { ok: false; error: string; fallbackWhatsappUrl?: string };

const statusValues: OrderStatus[] = [
  "New",
  "Accepted",
  "Preparing",
  "Ready to Serve",
  "Out for Delivery",
  "Completed",
  "Cancelled"
];

type MenuImportRow = {
  category: string;
  item_name: string;
  description?: string;
  price: number;
  is_available?: boolean;
  is_featured?: boolean;
};

type MenuItemInsert = {
  restaurant_id: string;
  category_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: null;
  is_available: boolean;
  is_featured: boolean;
};

type UploadMenuImageResult =
  | { ok: true; publicUrl: string; message: string }
  | { ok: false; error: string };

type RestaurantBrandImageKind = "logo" | "cover";

async function getOfferActionContext(formData: FormData) {
  const requestedRestaurantId = stringValue(formData, "restaurant_id");
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return null;
  }

  if (requestedRestaurantId) {
    await requireSuperAdmin();
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", requestedRestaurantId)
      .maybeSingle();

    return restaurant ? { restaurant, supabase } : null;
  }

  const session = await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
  return { restaurant: session.restaurant, supabase };
}

function uaeDateBoundary(value: string, endOfDay = false) {
  if (!value) {
    return null;
  }

  return new Date(
    `${value}T${endOfDay ? "23:59:59" : "00:00:00"}+04:00`
  ).toISOString();
}

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function limitedStringValue(formData: FormData, key: string, maxLength: number) {
  return stringValue(formData, key).slice(0, maxLength);
}

function decimalValue(formData: FormData, key: string) {
  const raw = stringValue(formData, key);
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

// A positive decimal, or null when empty/invalid/<=0. Used for the optional
// delivery radius: empty or zero means "no limit".
function positiveDecimalValue(formData: FormData, key: string) {
  const value = decimalValue(formData, key);
  return value !== null && value > 0 ? value : null;
}

// A commission percentage in (0, 100]. Empty/invalid/out-of-range → null, which
// the dashboard reads as "use the labelled 27% default".
function commissionRateValue(formData: FormData, key: string) {
  const value = decimalValue(formData, key);
  return value !== null && value > 0 && value <= 100 ? value : null;
}

async function getMenuActionContext(formData: FormData) {
  const requestedRestaurantId = stringValue(formData, "restaurant_id");
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return null;
  }

  if (requestedRestaurantId) {
    await requireSuperAdmin();
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", requestedRestaurantId)
      .maybeSingle();

    return restaurant ? { restaurant, supabase, isSuperAdmin: true } : null;
  }

  const session = await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
  return { restaurant: session.restaurant, supabase, isSuperAdmin: false };
}

function revalidateMenuPaths(restaurant: { id: string; slug: string }) {
  revalidatePath("/admin/menu");
  revalidatePath(`/r/${restaurant.slug}`);
  revalidatePath(`/super-admin/restaurants/${restaurant.id}`);
  revalidatePublicRestaurantCache(restaurant);
}

async function completeOnboardingTasks(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  restaurantId: string,
  taskKeys: string[]
) {
  if (taskKeys.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("onboarding_tasks")
    .update({
      is_completed: true,
      completed_at: new Date().toISOString()
    })
    .eq("restaurant_id", restaurantId)
    .in("task_key", taskKeys);
  databaseFailure("Onboarding task update", error);
}

function booleanFromValue(value: unknown, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  return ["true", "yes", "y", "1", "available", "featured"].includes(normalized);
}

function databaseFailure(operation: string, error: { message: string } | null) {
  if (error) {
    throw new Error(`${operation} failed: ${error.message}`);
  }
}

async function categoryBelongsToRestaurant(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  restaurantId: string,
  categoryId: string
) {
  const { data, error } = await supabase
    .from("menu_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  databaseFailure("Category validation", error);
  return Boolean(data);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

type OrderRateLimitResult = "allowed" | "blocked" | "unavailable";

async function checkOrderRateLimit(restaurantId: string): Promise<OrderRateLimitResult> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = requestHeaders.get("x-real-ip")?.trim();
  // Vercel supplies x-real-ip; use forwarded-for only as a compatibility
  // fallback for non-Vercel deployments.
  const clientIp = realIp || forwardedFor;

  if (!clientIp) {
    return process.env.NODE_ENV === "production" ? "unavailable" : "allowed";
  }

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return process.env.NODE_ENV === "production" ? "unavailable" : "allowed";
  }

  const fingerprint = createHash("sha256")
    .update(`${restaurantId}:${clientIp}`)
    .digest("hex");
  const { data, error } = await supabase.rpc("check_order_submission_rate_limit", {
    target_restaurant_id: restaurantId,
    target_client_fingerprint: fingerprint,
    attempt_limit: 8,
    window_size_seconds: 600
  });

  if (error) {
    console.error("WhatsOrder order rate-limit check unavailable", {
      code: error.code,
      message: error.message,
      restaurantId
    });
    return process.env.NODE_ENV === "production" ? "unavailable" : "allowed";
  }

  return data === true ? "allowed" : "blocked";
}

export async function createOrderAction(
  restaurantSlug: string,
  formData: FormData
): Promise<CreateOrderResult> {
  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    return { ok: false, error: "Restaurant not found." };
  }

  if (restaurant.accepting_orders === false) {
    return {
      ok: false,
      error: "This restaurant is temporarily not accepting new orders."
    };
  }

  if (
    !isRestaurantOpen(
      restaurant.opening_hours_enabled,
      restaurant.opening_hours,
      new Date(),
      restaurant.time_zone
    )
  ) {
    return {
      ok: false,
      error: "This restaurant is currently closed. Please order during opening hours."
    };
  }

  let items: CartLine[] = [];

  try {
    items = parseAndValidateCart(stringValue(formData, "items"));
  } catch {
    return { ok: false, error: "Your cart could not be read. Please refresh and try again." };
  }

  if (items.length === 0) {
    return { ok: false, error: "Your cart is empty or exceeds the allowed order size." };
  }

  const rateLimit = await checkOrderRateLimit(restaurant.id);
  if (rateLimit === "blocked") {
    return {
      ok: false,
      error: "Too many order attempts were received. Please wait a few minutes and try again."
    };
  }
  if (rateLimit === "unavailable") {
    return {
      ok: false,
      error: "Ordering is temporarily unavailable. Please try again in a moment."
    };
  }

  const [menu, offers, optionCatalog] = await Promise.all([
    getMenu(restaurant.id),
    getMenuOffers(restaurant.id),
    getMenuOptionCatalog(restaurant.id)
  ]);
  const verifiedCart = verifyCartAgainstMenu(items, menu, offers, optionCatalog);

  if (!verifiedCart.ok) {
    return { ok: false, error: verifiedCart.error };
  }

  const verifiedItems = verifiedCart.items;

  const customerName = limitedStringValue(formData, "customer_name", 120);
  const submittedCustomerPhone = limitedStringValue(
    formData,
    "customer_phone",
    24
  );
  const customerPhone = normalizeCustomerPhone(
    submittedCustomerPhone,
    restaurant.phone_country_code
  );
  const fulfilmentType = limitedStringValue(
    formData,
    "fulfilment_type",
    30
  ) as FulfilmentType;
  const carPlateNumber = limitedStringValue(formData, "car_plate_number", 40);
  const carDescription = limitedStringValue(formData, "car_description", 120);
  const tableNumber = limitedStringValue(formData, "table_number", 40);
  const deliveryArea = limitedStringValue(formData, "delivery_area", 120);
  const deliveryAddress = limitedStringValue(formData, "delivery_address", 500);
  const deliveryLandmark = limitedStringValue(formData, "delivery_landmark", 250);
  const deliveryLatitude = decimalValue(formData, "delivery_latitude");
  const deliveryLongitude = decimalValue(formData, "delivery_longitude");
  const submittedMapsUrl = limitedStringValue(formData, "delivery_google_maps_url", 500);
  const deliveryGoogleMapsUrl =
    submittedMapsUrl ||
    (deliveryLatitude !== null && deliveryLongitude !== null
      ? `https://www.google.com/maps?q=${deliveryLatitude},${deliveryLongitude}`
      : "");
  const deliveryPlaceId = limitedStringValue(formData, "delivery_place_id", 250);
  // Future Google Places Autocomplete can populate delivery_address_text and delivery_place_id here.
  const deliveryAddressText =
    limitedStringValue(formData, "delivery_address_text", 500) || deliveryAddress;
  const notes = limitedStringValue(formData, "notes", 1000);
  const paymentMethod = stringValue(formData, "payment_method") as PaymentMethod;
  const orderLanguage = getCustomerLanguage(formData.get("order_language"));
  const consentOrderProcessing = formData.get("consent_order_processing") === "on";
  const consentMarketing = formData.get("consent_marketing") === "on";
  const submissionToken = limitedStringValue(formData, "submission_token", 100);

  if (!customerName || !customerPhone) {
    return { ok: false, error: "Please complete your contact details." };
  }

  if (
    !isValidCustomerPhone(submittedCustomerPhone) ||
    !isValidCustomerPhone(customerPhone)
  ) {
    return { ok: false, error: "Please enter a valid phone number." };
  }

  if (!isFulfilmentEnabled(restaurant, fulfilmentType)) {
    return { ok: false, error: "Please choose an available order type." };
  }

  if (fulfilmentType === "delivery" && (!deliveryArea || !deliveryAddress)) {
    return { ok: false, error: "Please complete your delivery details." };
  }

  // Optional delivery-radius gate. This is the real enforcement — the client
  // check is UX only and can be bypassed. No-op when the restaurant has no
  // radius set (backward-compatible).
  if (fulfilmentType === "delivery") {
    const range = evaluateDeliveryRange(restaurant, {
      latitude: deliveryLatitude,
      longitude: deliveryLongitude
    });

    if (range.enforced && !range.withinRange) {
      const radiusKm = restaurant.delivery_radius_km ?? 0;
      const error =
        range.distanceKm === null
          ? `${restaurant.name} only delivers within ${radiusKm} km. Please share your current location to confirm you're in range, or choose pickup or dine-in.`
          : `Sorry — you're outside ${restaurant.name}'s delivery area (${radiusKm} km). You're about ${range.distanceKm.toFixed(
              1
            )} km away. You can still order for pickup or dine-in.`;
      return { ok: false, error };
    }
  }

  if (fulfilmentType === "car_pickup" && !carPlateNumber) {
    return { ok: false, error: "Please enter your car plate number." };
  }

  if (fulfilmentType === "dine_in" && !tableNumber) {
    return { ok: false, error: "Please enter your table number." };
  }

  const allowedPaymentMethods: PaymentMethod[] =
    restaurant.country_code === "IN"
      ? ["Cash on Delivery", "Card on Delivery", "UPI"]
      : ["Cash on Delivery", "Card on Delivery"];

  if (!allowedPaymentMethods.includes(paymentMethod)) {
    return { ok: false, error: "Please choose a payment method." };
  }

  if (!consentOrderProcessing) {
    return { ok: false, error: "Please accept order processing consent to continue." };
  }

  if (!submissionToken) {
    return { ok: false, error: "This checkout session is invalid. Please refresh and try again." };
  }

  const subtotal = verifiedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  if (subtotal < restaurant.minimum_order_amount) {
    return {
      ok: false,
      error: `Minimum order amount is ${formatCurrency(
        restaurant.minimum_order_amount,
        restaurant
      )}.`
    };
  }

  const appliedDeliveryFee = fulfilmentType === "delivery" ? restaurant.delivery_fee : 0;
  const total = subtotal + appliedDeliveryFee;
  // Future payment gateway support can reserve an unpaid payment intent here before WhatsApp opens.
  const message = buildWhatsAppMessage({
    restaurant,
    customerName,
    customerPhone,
    fulfilmentType,
    carPlateNumber,
    carDescription,
    tableNumber,
    deliveryArea,
    deliveryAddress,
    deliveryLandmark,
    deliveryGoogleMapsUrl,
    notes,
    paymentMethod,
    items: verifiedItems,
    subtotal,
    deliveryFee: appliedDeliveryFee,
    total,
    language: orderLanguage
  });
  const consentTimestamp = new Date().toISOString();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return {
      ok: false,
      error: "This order was not saved to the dashboard. You can send it directly on WhatsApp.",
      fallbackWhatsappUrl: buildWhatsAppUrl(
        restaurant.whatsapp_number,
        message,
        restaurant.phone_country_code
      )
    };
  }

  // Stamp-card progress line for the confirmation message — free-form, inside the 24h
  // WhatsApp service window. Returns "" when the restaurant's loyalty program is disabled.
  const loyaltyLine = await loyaltyLineForOrder(supabase, restaurant.id, customerPhone);
  const whatsappMessage = loyaltyLine ? `${message}\n\n${loyaltyLine}` : message;

  const { data, error } = await supabase.rpc("create_order_with_customer_v4", {
    target_restaurant_id: restaurant.id,
    order_customer_name: customerName,
    order_customer_phone: customerPhone,
    order_fulfilment_type: fulfilmentType,
    order_car_plate_number: carPlateNumber || null,
    order_car_description: carDescription || null,
    order_table_number: tableNumber || null,
    order_delivery_area: fulfilmentType === "delivery" ? deliveryArea : null,
    order_delivery_address: fulfilmentType === "delivery" ? deliveryAddress : null,
    order_delivery_latitude: fulfilmentType === "delivery" ? deliveryLatitude : null,
    order_delivery_longitude: fulfilmentType === "delivery" ? deliveryLongitude : null,
    order_delivery_google_maps_url:
      fulfilmentType === "delivery" ? deliveryGoogleMapsUrl || null : null,
    order_delivery_place_id: fulfilmentType === "delivery" ? deliveryPlaceId || null : null,
    order_delivery_address_text:
      fulfilmentType === "delivery" ? deliveryAddressText || null : null,
    order_delivery_landmark: fulfilmentType === "delivery" ? deliveryLandmark || null : null,
    order_notes: notes || null,
    order_payment_method: paymentMethod,
    order_items: verifiedItems,
    order_subtotal: subtotal,
    order_delivery_fee: appliedDeliveryFee,
    order_total: total,
    order_whatsapp_message: whatsappMessage,
    order_consent_processing: consentOrderProcessing,
    order_consent_marketing: consentMarketing,
    order_consent_timestamp: consentTimestamp,
    order_submission_token: submissionToken
  });

  if (error) {
    console.error("WhatsOrder order persistence failed", {
      code: error.code,
      message: error.message,
      restaurantId: restaurant.id
    });

    if (error.code === "PGRST202" || error.message.includes("Could not find the function")) {
      return {
        ok: false,
        error:
          "This order was not saved because a database update is pending. You can send it directly on WhatsApp.",
        fallbackWhatsappUrl: buildWhatsAppUrl(
          restaurant.whatsapp_number,
          whatsappMessage,
          restaurant.phone_country_code
        )
      };
    }

    return {
      ok: false,
      error: "This order was not saved to the dashboard. You can retry or send it directly on WhatsApp.",
      fallbackWhatsappUrl: buildWhatsAppUrl(
        restaurant.whatsapp_number,
        whatsappMessage,
        restaurant.phone_country_code
      )
    };
  }

  const orderId = String(data);
  const { data: persistedOrder } = await supabase
    .from("orders")
    .select("whatsapp_message")
    .eq("id", orderId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  const persistedMessage = String(persistedOrder?.whatsapp_message ?? message);
  revalidatePath(`/r/${restaurant.slug}`);
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/customers");

  return {
    ok: true,
    // Future WhatsApp Business API support can replace this click-to-WhatsApp URL with a template send.
    orderId,
    whatsappUrl: buildWhatsAppUrl(
      restaurant.whatsapp_number,
      persistedMessage,
      restaurant.phone_country_code
    ),
    whatsappAppUrl: buildWhatsAppAppUrl(
      restaurant.whatsapp_number,
      persistedMessage,
      restaurant.phone_country_code
    )
  };
}

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
      "transition_order_status_and_record_event",
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

    // Free in-window WhatsApp update ("accepted", "ready", ...). Best-effort:
    // never throws, never blocks the status change.
    await sendOrderStatusNotification({
      supabase,
      restaurant,
      orderId,
      status
    });
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

export async function withdrawCustomerMarketingConsentAction(formData: FormData) {
  const session = await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
  const customerId = stringValue(formData, "customer_id");
  const supabase = getSupabaseAdmin();

  if (!supabase || !customerId) {
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("customers")
    .update({
      consent_marketing: false,
      marketing_opt_in: false,
      marketing_consent_source: "restaurant_recorded_stop",
      marketing_consent_updated_at: now,
      marketing_consent_withdrawn_at: now
    })
    .eq("id", customerId)
    .eq("restaurant_id", session.restaurantId);
  databaseFailure("Marketing consent withdrawal", error);

  revalidatePath("/admin/customers");
}

export async function redeemLoyaltyRewardAction(formData: FormData) {
  const session = await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
  const customerId = stringValue(formData, "customer_id");
  const supabase = getSupabaseAdmin();

  if (!supabase || !customerId) {
    return;
  }

  // Tenant guard: redeem_loyalty_reward derives the restaurant from the customer and does
  // not scope to the caller, so confirm this customer belongs to the session's restaurant
  // before redeeming on their card.
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("restaurant_id", session.restaurantId)
    .maybeSingle();

  if (!customer) {
    return;
  }

  // The RPC deducts a full card, logs a 'redeemed' transaction, and returns
  // { ok:false, reason:'not_enough_stamps' } if the balance fell short (the button is
  // gated on eligibility, so that path only happens on a stale view).
  const { error } = await supabase.rpc("redeem_loyalty_reward", {
    p_customer_id: customerId,
    p_order_id: null
  });
  databaseFailure("Loyalty reward redemption", error);

  revalidatePath("/admin/customers");
}

export async function addMenuItemAction(formData: FormData) {
  const context = await getMenuActionContext(formData);

  if (!context) {
    return;
  }

  const { restaurant, supabase } = context;
  const categoryId = stringValue(formData, "category_id");
  if (!(await categoryBelongsToRestaurant(supabase, restaurant.id, categoryId))) {
    throw new Error("The selected category does not belong to this restaurant.");
  }
  const imageUrl = stringValue(formData, "image_url") || null;
  const { data: createdItem, error } = await supabase
    .from("menu_items")
    .insert({
      restaurant_id: restaurant.id,
      category_id: categoryId,
      name: stringValue(formData, "name"),
      name_ar: stringValue(formData, "name_ar") || null,
      description: stringValue(formData, "description") || null,
      description_ar: stringValue(formData, "description_ar") || null,
      price: Number(stringValue(formData, "price")),
      image_url: imageUrl,
      is_available: formData.get("is_available") === "on",
      is_featured: formData.get("is_featured") === "on"
    })
    .select("id")
    .single();
  databaseFailure("Menu item creation", error);

  const optionGroupIds = optionGroupIdsFromForm(formData);
  if (createdItem && optionGroupIds !== null) {
    await syncItemOptionGroups(supabase, restaurant.id, createdItem.id, optionGroupIds);
  }

  await completeOnboardingTasks(supabase, restaurant.id, [
    "items_added",
    ...(imageUrl ? ["images_added"] : [])
  ]);

  revalidateMenuPaths(restaurant);
}

export async function updateMenuItemAction(formData: FormData) {
  const context = await getMenuActionContext(formData);
  const itemId = stringValue(formData, "item_id");

  if (!context || !itemId) {
    return;
  }

  const { restaurant, supabase } = context;
  const categoryId = stringValue(formData, "category_id");
  if (!(await categoryBelongsToRestaurant(supabase, restaurant.id, categoryId))) {
    throw new Error("The selected category does not belong to this restaurant.");
  }
  const imageUrl = stringValue(formData, "image_url") || null;
  const { error } = await supabase
    .from("menu_items")
    .update({
      name: stringValue(formData, "name"),
      name_ar: stringValue(formData, "name_ar") || null,
      description: stringValue(formData, "description") || null,
      description_ar: stringValue(formData, "description_ar") || null,
      price: Number(stringValue(formData, "price")),
      category_id: categoryId,
      image_url: imageUrl,
      is_available: formData.get("is_available") === "on",
      is_featured: formData.get("is_featured") === "on"
    })
    .eq("id", itemId)
    .eq("restaurant_id", restaurant.id);
  databaseFailure("Menu item update", error);

  const optionGroupIds = optionGroupIdsFromForm(formData);
  if (optionGroupIds !== null) {
    await syncItemOptionGroups(supabase, restaurant.id, itemId, optionGroupIds);
  }

  if (imageUrl) {
    await completeOnboardingTasks(supabase, restaurant.id, ["images_added"]);
  }

  revalidateMenuPaths(restaurant);
}

export async function uploadMenuItemImageAction(formData: FormData): Promise<UploadMenuImageResult> {
  const context = await getMenuActionContext(formData);
  const file = formData.get("image");
  const itemName = stringValue(formData, "item_name") || "menu-item";
  const itemId = stringValue(formData, "item_id");

  if (!context) {
    return { ok: false, error: "Image upload needs Supabase Storage access." };
  }

  const { restaurant, supabase } = context;
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Please choose an image to upload." };
  }

  let normalizedImage;
  try {
    normalizedImage = await normalizeImageUpload(file, {
      maximumBytes: 2 * 1024 * 1024,
      maximumEdge: 1_200
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid image." };
  }

  const bucketName = "menu-images";
  const itemSlug = slugify(itemName) || "menu-item";
  const filePath = `restaurants/${restaurant.slug}/${itemSlug}-${Date.now()}.${normalizedImage.extension}`;
  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(filePath, normalizedImage.bytes, {
      contentType: normalizedImage.contentType,
      upsert: false
    });

  if (uploadError) {
    const message = uploadError.message.toLowerCase().includes("bucket")
      ? "Image storage is not provisioned. Contact WhatsOrder support."
      : uploadError.message;
    return { ok: false, error: message };
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
  const publicUrl = data.publicUrl;

  if (itemId) {
    const { error: imageSaveError } = await supabase
      .from("menu_items")
      .update({ image_url: publicUrl })
      .eq("id", itemId)
      .eq("restaurant_id", restaurant.id);
    if (imageSaveError) {
      await supabase.storage.from(bucketName).remove([filePath]);
      return { ok: false, error: imageSaveError.message };
    }

    await completeOnboardingTasks(supabase, restaurant.id, ["images_added"]);
    revalidateMenuPaths(restaurant);
  }

  return { ok: true, publicUrl, message: "Image uploaded successfully." };
}

export async function uploadRestaurantBrandImageAction(
  formData: FormData
): Promise<UploadMenuImageResult> {
  const context = await getOfferActionContext(formData);
  const file = formData.get("image");
  const kindValue = stringValue(formData, "kind");

  if (!context) {
    return { ok: false, error: "Image upload needs Supabase Storage access." };
  }

  if (kindValue !== "logo" && kindValue !== "cover") {
    return { ok: false, error: "Choose a valid restaurant image type." };
  }

  const kind: RestaurantBrandImageKind = kindValue;
  const { restaurant, supabase } = context;
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Please choose an image to upload." };
  }

  const maximumBytes = kind === "logo" ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
  let normalizedImage;
  try {
    normalizedImage = await normalizeImageUpload(file, {
      maximumBytes,
      maximumEdge: kind === "logo" ? 1_200 : 2_400
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid image." };
  }

  const bucketName = "restaurant-assets";
  const filePath = `restaurants/${restaurant.id}/${kind}-${Date.now()}.${normalizedImage.extension}`;
  const { error: uploadError } = await supabase.storage.from(bucketName).upload(
    filePath,
    normalizedImage.bytes,
    {
      contentType: normalizedImage.contentType,
      upsert: false
    }
  );

  if (uploadError) {
    const message = uploadError.message.toLowerCase().includes("bucket")
      ? "Restaurant image storage is not provisioned. Contact WhatsOrder support."
      : uploadError.message;
    return { ok: false, error: message };
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
  const publicUrl = data.publicUrl;
  const column = kind === "logo" ? "logo_url" : "cover_image_url";
  const previousUrl = String(restaurant[column] ?? "");
  const { error: imageSaveError } = await supabase
    .from("restaurants")
    .update({ [column]: publicUrl })
    .eq("id", restaurant.id);

  if (imageSaveError) {
    await supabase.storage.from(bucketName).remove([filePath]);
    return { ok: false, error: imageSaveError.message };
  }

  const previousStoragePath = storagePathFromPublicUrl(previousUrl, bucketName);
  if (previousStoragePath) {
    await supabase.storage.from(bucketName).remove([previousStoragePath]);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath(`/r/${restaurant.slug}`);
  revalidatePath(`/super-admin/restaurants/${restaurant.id}`);
  revalidatePublicRestaurantCache(restaurant);

  return {
    ok: true,
    publicUrl,
    message: `${kind === "logo" ? "Logo" : "Cover image"} uploaded successfully.`
  };
}

export async function removeMenuItemImageAction(formData: FormData) {
  const context = await getMenuActionContext(formData);
  const itemId = stringValue(formData, "item_id");

  if (!context || !itemId) {
    return;
  }

  const { restaurant, supabase } = context;
  const { data: item } = await supabase
    .from("menu_items")
    .select("image_url")
    .eq("id", itemId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  const { error } = await supabase
    .from("menu_items")
    .update({ image_url: null })
    .eq("id", itemId)
    .eq("restaurant_id", restaurant.id);
  databaseFailure("Menu image removal", error);
  const storagePath = storagePathFromPublicUrl(String(item?.image_url ?? ""));
  if (storagePath) {
    await supabase.storage.from("menu-images").remove([storagePath]);
  }

  revalidateMenuPaths(restaurant);
}

export async function toggleMenuItemAvailabilityAction(formData: FormData) {
  const context = await getMenuActionContext(formData);
  const itemId = stringValue(formData, "item_id");
  const isAvailable = stringValue(formData, "is_available") === "true";

  if (!context || !itemId) {
    return;
  }

  const { restaurant, supabase } = context;
  const { error } = await supabase
    .from("menu_items")
    .update({ is_available: isAvailable })
    .eq("id", itemId)
    .eq("restaurant_id", restaurant.id);
  databaseFailure("Menu availability update", error);

  revalidateMenuPaths(restaurant);
}

export async function deleteMenuItemAction(formData: FormData) {
  const context = await getMenuActionContext(formData);
  const itemId = stringValue(formData, "item_id");

  if (!context || !itemId) {
    return;
  }

  const { restaurant, supabase } = context;
  const { data: item } = await supabase
    .from("menu_items")
    .select("image_url")
    .eq("id", itemId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();
  const { error } = await supabase
    .from("menu_items")
    .delete()
    .eq("id", itemId)
    .eq("restaurant_id", restaurant.id);
  databaseFailure("Menu item deletion", error);
  const storagePath = storagePathFromPublicUrl(String(item?.image_url ?? ""));
  if (storagePath) {
    await supabase.storage.from("menu-images").remove([storagePath]);
  }

  revalidateMenuPaths(restaurant);
}

export async function importMenuRowsAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const context = await getMenuActionContext(formData);
  const rawRows = stringValue(formData, "rows");

  if (!context) {
    return { ok: false, message: "Menu import needs Supabase write access." };
  }

  const { restaurant, supabase } = context;
  const menu = await getMenu(restaurant.id, { admin: true });
  let rows: MenuImportRow[] = [];

  try {
    rows = JSON.parse(rawRows) as MenuImportRow[];
  } catch {
    return { ok: false, message: "Imported rows could not be read." };
  }

  const validRows = rows
    .map((row) => ({
      category: String(row.category ?? "").trim(),
      item_name: String(row.item_name ?? "").trim(),
      description: String(row.description ?? "").trim(),
      price: Number(row.price),
      is_available: booleanFromValue(row.is_available, true),
      is_featured: booleanFromValue(row.is_featured, false)
    }))
    .filter((row) => row.category && row.item_name && Number.isFinite(row.price) && row.price >= 0);

  if (validRows.length === 0) {
    return { ok: false, message: "No valid menu rows to import." };
  }

  const categoriesByName = new Map(
    menu.categories.map((category) => [category.name.trim().toLowerCase(), category])
  );

  for (const categoryName of [...new Set(validRows.map((row) => row.category))]) {
    const key = categoryName.toLowerCase();

    if (categoriesByName.has(key)) {
      continue;
    }

    const { data, error: categoryError } = await supabase
      .from("menu_categories")
      .insert({
        restaurant_id: restaurant.id,
        name: categoryName,
        display_order: categoriesByName.size + 1,
        is_active: true
      })
      .select("*")
      .single();
    databaseFailure("Imported category creation", categoryError);

    if (data) {
      categoriesByName.set(key, data);
    }
  }

  const itemsToInsert = validRows.reduce<MenuItemInsert[]>((items, row) => {
      const category = categoriesByName.get(row.category.toLowerCase());

      if (!category) {
        return items;
      }

      items.push({
        restaurant_id: restaurant.id,
        category_id: category.id,
        name: row.item_name,
        description: row.description || null,
        price: row.price,
        image_url: null,
        is_available: row.is_available,
        is_featured: row.is_featured
      });

      return items;
    }, []);

  if (itemsToInsert.length === 0) {
    return { ok: false, message: "No rows matched valid categories." };
  }

  const { error } = await supabase.from("menu_items").insert(itemsToInsert);

  if (error) {
    return { ok: false, message: error.message };
  }

  await completeOnboardingTasks(supabase, restaurant.id, [
    "menu_uploaded",
    "categories_created",
    "items_added"
  ]);
  revalidateMenuPaths(restaurant);

  return { ok: true, message: `Imported ${itemsToInsert.length} menu items.` };
}

export async function addMenuOfferAction(formData: FormData) {
  const context = await getOfferActionContext(formData);

  if (!context) {
    return;
  }

  const { restaurant, supabase } = context;
  const menuItemId = stringValue(formData, "menu_item_id");
  const title = limitedStringValue(formData, "title", 120);
  const promotionalPrice = Number(stringValue(formData, "promotional_price"));
  const maximumQuantity = Number(stringValue(formData, "max_quantity_per_order") || 1);
  const { data: menuItem, error: itemError } = await supabase
    .from("menu_items")
    .select("id,price")
    .eq("id", menuItemId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  databaseFailure("Offer item lookup", itemError);

  if (
    !title ||
    !menuItem ||
    !Number.isFinite(promotionalPrice) ||
    promotionalPrice < 0 ||
    promotionalPrice >= Number(menuItem.price) ||
    !Number.isInteger(maximumQuantity) ||
    maximumQuantity < 1 ||
    maximumQuantity > 25
  ) {
    throw new Error(
      "Offer price must be lower than the item price and maximum quantity must be between 1 and 25."
    );
  }

  const { count } = await supabase
    .from("menu_offers")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurant.id);
  const { error } = await supabase.from("menu_offers").insert({
    restaurant_id: restaurant.id,
    menu_item_id: menuItemId,
    title,
    title_ar: limitedStringValue(formData, "title_ar", 120) || null,
    description: limitedStringValue(formData, "description", 300) || null,
    description_ar: limitedStringValue(formData, "description_ar", 300) || null,
    promotional_price: promotionalPrice,
    max_quantity_per_order: maximumQuantity,
    starts_at: uaeDateBoundary(stringValue(formData, "starts_on")),
    ends_at: uaeDateBoundary(stringValue(formData, "ends_on"), true),
    display_order: count ?? 0,
    is_active: formData.get("is_active") === "on"
  });
  databaseFailure("Offer creation", error);

  revalidateMenuPaths(restaurant);
}

export async function toggleMenuOfferAction(formData: FormData) {
  const context = await getOfferActionContext(formData);
  const offerId = stringValue(formData, "offer_id");

  if (!context || !offerId) {
    return;
  }

  const { restaurant, supabase } = context;
  const { error } = await supabase
    .from("menu_offers")
    .update({ is_active: stringValue(formData, "is_active") === "true" })
    .eq("id", offerId)
    .eq("restaurant_id", restaurant.id);
  databaseFailure("Offer availability update", error);

  revalidateMenuPaths(restaurant);
}

export async function updateMenuOfferLimitAction(formData: FormData) {
  const context = await getOfferActionContext(formData);
  const offerId = stringValue(formData, "offer_id");
  const maximumQuantity = Number(stringValue(formData, "max_quantity_per_order"));

  if (
    !context ||
    !offerId ||
    !Number.isInteger(maximumQuantity) ||
    maximumQuantity < 1 ||
    maximumQuantity > 25
  ) {
    return;
  }

  const { restaurant, supabase } = context;
  const { error } = await supabase
    .from("menu_offers")
    .update({ max_quantity_per_order: maximumQuantity })
    .eq("id", offerId)
    .eq("restaurant_id", restaurant.id);
  databaseFailure("Offer quantity limit update", error);

  revalidateMenuPaths(restaurant);
}

export async function deleteMenuOfferAction(formData: FormData) {
  const context = await getOfferActionContext(formData);
  const offerId = stringValue(formData, "offer_id");

  if (!context || !offerId) {
    return;
  }

  const { restaurant, supabase } = context;
  const { error } = await supabase
    .from("menu_offers")
    .delete()
    .eq("id", offerId)
    .eq("restaurant_id", restaurant.id);
  databaseFailure("Offer deletion", error);

  revalidateMenuPaths(restaurant);
}

export async function updateRestaurantSettingsAction(formData: FormData) {
  const session = await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
  const restaurant = session.restaurant;
  const supabase = getSupabaseAdmin();

  if (!restaurant || !supabase) {
    return;
  }

  const { error } = await supabase
    .from("restaurants")
    .update({
      name: stringValue(formData, "name"),
      name_ar: stringValue(formData, "name_ar") || null,
      logo_url: stringValue(formData, "logo_url") || null,
      cover_image_url: stringValue(formData, "cover_image_url") || null,
      whatsapp_number: normalizeWhatsAppNumber(
        stringValue(formData, "whatsapp_number"),
        restaurant.phone_country_code
      ),
      address: stringValue(formData, "address") || null,
      address_ar: stringValue(formData, "address_ar") || null,
      subtitle_ar: stringValue(formData, "subtitle_ar") || null,
      delivery_fee: Number(stringValue(formData, "delivery_fee")),
      minimum_order_amount: Number(stringValue(formData, "minimum_order_amount")),
      delivery_enabled: formData.get("delivery_enabled") === "on",
      pickup_enabled: formData.get("pickup_enabled") === "on",
      car_pickup_enabled: formData.get("car_pickup_enabled") === "on",
      dine_in_enabled: formData.get("dine_in_enabled") === "on",
      public_reviews_enabled: formData.get("public_reviews_enabled") === "on",
      accepting_orders: formData.get("accepting_orders") === "on",
      status_notifications_enabled:
        formData.get("status_notifications_enabled") === "on",
      shift_marketplace_channels: configuredMarketplaceChannels(
        formData.getAll("shift_marketplace_channels")
      ),
      opening_hours_enabled: formData.get("opening_hours_enabled") === "on",
      opening_hours: openingHoursFromFormData(formData),
      latitude: decimalValue(formData, "latitude"),
      longitude: decimalValue(formData, "longitude"),
      delivery_radius_km: positiveDecimalValue(formData, "delivery_radius_km"),
      commission_rate: commissionRateValue(formData, "commission_rate"),
      is_active: formData.get("is_active") === "on"
    })
    .eq("id", restaurant.id);
  databaseFailure("Restaurant settings update", error);

  revalidatePath("/admin/settings");
  revalidatePath(`/r/${restaurant.slug}`);
  revalidatePublicRestaurantCache(restaurant);
}

// Owner/admin-only: the stamp-card terms (card size, reward text, qualifying minimum) change
// the loyalty economics, so this is gated tighter than the general settings save above —
// managers and staff cannot retune them.
export async function updateLoyaltySettingsAction(formData: FormData) {
  const session = await requireRestaurantRole(["owner", "restaurant_admin"]);
  const restaurant = session.restaurant;
  const supabase = getSupabaseAdmin();

  if (!restaurant || !supabase) {
    return;
  }

  // Card size must be a whole number of at least 1; reward text must be non-empty so the
  // WhatsApp line and redeem banner never render "free <blank>".
  const requiredRaw = Math.round(Number(stringValue(formData, "loyalty_stamps_required")));
  const stampsRequired = Number.isFinite(requiredRaw) ? Math.min(Math.max(requiredRaw, 1), 100) : 10;
  const rewardDescription =
    stringValue(formData, "loyalty_reward_description").slice(0, 120) || "reward";

  const { error } = await supabase
    .from("restaurants")
    .update({
      loyalty_enabled: formData.get("loyalty_enabled") === "on",
      loyalty_stamps_required: stampsRequired,
      loyalty_reward_description: rewardDescription,
      loyalty_qualifying_min_amount: positiveDecimalValue(formData, "loyalty_qualifying_min_amount")
    })
    .eq("id", restaurant.id);
  databaseFailure("Loyalty settings update", error);

  revalidatePath("/admin/settings");
  revalidatePath("/admin/customers");
}

export async function addCategoryAction(formData: FormData) {
  const context = await getMenuActionContext(formData);

  if (!context) {
    return;
  }

  const { restaurant, supabase } = context;
  const name = stringValue(formData, "name");
  const normalizedName = name.trim().toLowerCase().replace(/[\s_-]+/g, " ");

  if (normalizedName === "best seller" || normalizedName === "best sellers") {
    throw new Error(
      "Best Sellers is created automatically from product tags. Add the product to its normal category and enable its Best Seller tag."
    );
  }

  const menu = await getMenu(restaurant.id, { admin: true });
  const { error } = await supabase.from("menu_categories").insert({
    restaurant_id: restaurant.id,
    name,
    name_ar: stringValue(formData, "name_ar") || null,
    display_order: menu.categories.length + 1,
    is_active: true
  });
  databaseFailure("Menu category creation", error);
  await completeOnboardingTasks(supabase, restaurant.id, ["categories_created"]);

  revalidateMenuPaths(restaurant);
}

export async function moveCategoryAction(formData: FormData) {
  const context = await getMenuActionContext(formData);
  const categoryId = stringValue(formData, "category_id");
  const direction = stringValue(formData, "direction");

  if (!context || !categoryId || !["up", "down"].includes(direction)) {
    return;
  }

  const { restaurant, supabase } = context;
  const menu = await getMenu(restaurant.id, { admin: true });
  const orderedCategories = [...menu.categories].sort(
    (first, second) => first.display_order - second.display_order
  );
  const currentIndex = orderedCategories.findIndex((category) => category.id === categoryId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedCategories.length) {
    return;
  }

  const currentCategory = orderedCategories[currentIndex];
  const targetCategory = orderedCategories[targetIndex];

  await Promise.all([
    updateCategoryDisplayOrder(supabase, currentCategory, targetCategory.display_order),
    updateCategoryDisplayOrder(supabase, targetCategory, currentCategory.display_order)
  ]);

  revalidateMenuPaths(restaurant);
}

// ── Option groups (variants & modifiers) ────────────────────────────────────

async function optionGroupBelongsToRestaurant(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  restaurantId: string,
  groupId: string
) {
  const { data, error } = await supabase
    .from("menu_option_groups")
    .select("id")
    .eq("id", groupId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  databaseFailure("Option group validation", error);
  return Boolean(data);
}

// min/max from the form: the UI's "Variant" kind submits min=1/max=1; the
// "Add-ons" kind submits min=0 and an optional max. Server re-validates so a
// crafted request can't create an impossible group.
function optionGroupSelectionBounds(formData: FormData) {
  const minRaw = Math.round(Number(stringValue(formData, "min_select")));
  const maxValue = stringValue(formData, "max_select");
  const maxRaw = maxValue === "" ? null : Math.round(Number(maxValue));
  const minSelect = Number.isFinite(minRaw) ? Math.min(Math.max(minRaw, 0), 10) : 0;
  const maxSelect =
    maxRaw !== null && Number.isFinite(maxRaw)
      ? Math.min(Math.max(maxRaw, Math.max(minSelect, 1)), 10)
      : null;

  return { minSelect, maxSelect };
}

export async function addOptionGroupAction(formData: FormData) {
  const context = await getMenuActionContext(formData);

  if (!context) {
    return;
  }

  const { restaurant, supabase } = context;
  const name = limitedStringValue(formData, "name", 120);

  if (!name) {
    throw new Error("Option group name is required.");
  }

  const { minSelect, maxSelect } = optionGroupSelectionBounds(formData);
  const { count } = await supabase
    .from("menu_option_groups")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurant.id);
  const { error } = await supabase.from("menu_option_groups").insert({
    restaurant_id: restaurant.id,
    name,
    name_ar: limitedStringValue(formData, "name_ar", 120) || null,
    min_select: minSelect,
    max_select: maxSelect,
    display_order: count ?? 0
  });
  databaseFailure("Option group creation", error);

  revalidateMenuPaths(restaurant);
}

export async function updateOptionGroupAction(formData: FormData) {
  const context = await getMenuActionContext(formData);
  const groupId = stringValue(formData, "group_id");

  if (!context || !groupId) {
    return;
  }

  const { restaurant, supabase } = context;
  const name = limitedStringValue(formData, "name", 120);

  if (!name) {
    throw new Error("Option group name is required.");
  }

  const { minSelect, maxSelect } = optionGroupSelectionBounds(formData);
  const { error } = await supabase
    .from("menu_option_groups")
    .update({
      name,
      name_ar: limitedStringValue(formData, "name_ar", 120) || null,
      min_select: minSelect,
      max_select: maxSelect
    })
    .eq("id", groupId)
    .eq("restaurant_id", restaurant.id);
  databaseFailure("Option group update", error);

  revalidateMenuPaths(restaurant);
}

export async function deleteOptionGroupAction(formData: FormData) {
  const context = await getMenuActionContext(formData);
  const groupId = stringValue(formData, "group_id");

  if (!context || !groupId) {
    return;
  }

  const { restaurant, supabase } = context;
  // Cascades delete the group's options and item links.
  const { error } = await supabase
    .from("menu_option_groups")
    .delete()
    .eq("id", groupId)
    .eq("restaurant_id", restaurant.id);
  databaseFailure("Option group deletion", error);

  revalidateMenuPaths(restaurant);
}

export async function moveOptionGroupAction(formData: FormData) {
  const context = await getMenuActionContext(formData);
  const groupId = stringValue(formData, "group_id");
  const direction = stringValue(formData, "direction");

  if (!context || !groupId || !["up", "down"].includes(direction)) {
    return;
  }

  const { restaurant, supabase } = context;
  const { data: groups, error } = await supabase
    .from("menu_option_groups")
    .select("id,display_order")
    .eq("restaurant_id", restaurant.id)
    .order("display_order");
  databaseFailure("Option group ordering", error);

  const ordered = groups ?? [];
  const currentIndex = ordered.findIndex((group) => group.id === groupId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) {
    return;
  }

  const current = ordered[currentIndex];
  const target = ordered[targetIndex];
  await Promise.all([
    supabase
      .from("menu_option_groups")
      .update({ display_order: target.display_order })
      .eq("id", current.id)
      .eq("restaurant_id", restaurant.id),
    supabase
      .from("menu_option_groups")
      .update({ display_order: current.display_order })
      .eq("id", target.id)
      .eq("restaurant_id", restaurant.id)
  ]);

  revalidateMenuPaths(restaurant);
}

export async function addMenuOptionAction(formData: FormData) {
  const context = await getMenuActionContext(formData);
  const groupId = stringValue(formData, "group_id");

  if (!context || !groupId) {
    return;
  }

  const { restaurant, supabase } = context;

  if (!(await optionGroupBelongsToRestaurant(supabase, restaurant.id, groupId))) {
    throw new Error("The selected option group does not belong to this restaurant.");
  }

  const name = limitedStringValue(formData, "name", 120);

  if (!name) {
    throw new Error("Option name is required.");
  }

  const priceDelta = decimalValue(formData, "price_delta") ?? 0;
  const { count } = await supabase
    .from("menu_options")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId);
  const { error } = await supabase.from("menu_options").insert({
    restaurant_id: restaurant.id,
    group_id: groupId,
    name,
    name_ar: limitedStringValue(formData, "name_ar", 120) || null,
    price_delta: priceDelta,
    is_available: formData.get("is_available") !== "false",
    display_order: count ?? 0
  });
  databaseFailure("Option creation", error);

  revalidateMenuPaths(restaurant);
}

export async function updateMenuOptionAction(formData: FormData) {
  const context = await getMenuActionContext(formData);
  const optionId = stringValue(formData, "option_id");

  if (!context || !optionId) {
    return;
  }

  const { restaurant, supabase } = context;
  const name = limitedStringValue(formData, "name", 120);

  if (!name) {
    throw new Error("Option name is required.");
  }

  const { error } = await supabase
    .from("menu_options")
    .update({
      name,
      name_ar: limitedStringValue(formData, "name_ar", 120) || null,
      price_delta: decimalValue(formData, "price_delta") ?? 0
    })
    .eq("id", optionId)
    .eq("restaurant_id", restaurant.id);
  databaseFailure("Option update", error);

  revalidateMenuPaths(restaurant);
}

export async function toggleMenuOptionAvailabilityAction(formData: FormData) {
  const context = await getMenuActionContext(formData);
  const optionId = stringValue(formData, "option_id");

  if (!context || !optionId) {
    return;
  }

  const { restaurant, supabase } = context;
  const { error } = await supabase
    .from("menu_options")
    .update({ is_available: stringValue(formData, "is_available") === "true" })
    .eq("id", optionId)
    .eq("restaurant_id", restaurant.id);
  databaseFailure("Option availability update", error);

  revalidateMenuPaths(restaurant);
}

export async function deleteMenuOptionAction(formData: FormData) {
  const context = await getMenuActionContext(formData);
  const optionId = stringValue(formData, "option_id");

  if (!context || !optionId) {
    return;
  }

  const { restaurant, supabase } = context;
  const { error } = await supabase
    .from("menu_options")
    .delete()
    .eq("id", optionId)
    .eq("restaurant_id", restaurant.id);
  databaseFailure("Option deletion", error);

  revalidateMenuPaths(restaurant);
}

export async function moveMenuOptionAction(formData: FormData) {
  const context = await getMenuActionContext(formData);
  const optionId = stringValue(formData, "option_id");
  const direction = stringValue(formData, "direction");

  if (!context || !optionId || !["up", "down"].includes(direction)) {
    return;
  }

  const { restaurant, supabase } = context;
  const { data: option } = await supabase
    .from("menu_options")
    .select("id,group_id")
    .eq("id", optionId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  if (!option) {
    return;
  }

  const { data: options, error } = await supabase
    .from("menu_options")
    .select("id,display_order")
    .eq("group_id", option.group_id)
    .eq("restaurant_id", restaurant.id)
    .order("display_order");
  databaseFailure("Option ordering", error);

  const ordered = options ?? [];
  const currentIndex = ordered.findIndex((entry) => entry.id === optionId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) {
    return;
  }

  const current = ordered[currentIndex];
  const target = ordered[targetIndex];
  await Promise.all([
    supabase
      .from("menu_options")
      .update({ display_order: target.display_order })
      .eq("id", current.id)
      .eq("restaurant_id", restaurant.id),
    supabase
      .from("menu_options")
      .update({ display_order: current.display_order })
      .eq("id", target.id)
      .eq("restaurant_id", restaurant.id)
  ]);

  revalidateMenuPaths(restaurant);
}

// Replace-set the option groups attached to a menu item. Called from the item
// form (hidden option_group_ids JSON) and usable standalone.
async function syncItemOptionGroups(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  restaurantId: string,
  itemId: string,
  groupIds: string[]
) {
  const uniqueGroupIds = [...new Set(groupIds)].slice(0, 20);

  if (uniqueGroupIds.length > 0) {
    const { data: ownedGroups, error: ownedError } = await supabase
      .from("menu_option_groups")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .in("id", uniqueGroupIds);
    databaseFailure("Option group ownership check", ownedError);

    if ((ownedGroups ?? []).length !== uniqueGroupIds.length) {
      throw new Error("One of the selected option groups does not belong to this restaurant.");
    }
  }

  const { error: deleteError } = uniqueGroupIds.length
    ? await supabase
        .from("menu_item_option_groups")
        .delete()
        .eq("menu_item_id", itemId)
        .eq("restaurant_id", restaurantId)
        .not("group_id", "in", `(${uniqueGroupIds.join(",")})`)
    : await supabase
        .from("menu_item_option_groups")
        .delete()
        .eq("menu_item_id", itemId)
        .eq("restaurant_id", restaurantId);
  databaseFailure("Option group detach", deleteError);

  if (uniqueGroupIds.length > 0) {
    const { error: upsertError } = await supabase
      .from("menu_item_option_groups")
      .upsert(
        uniqueGroupIds.map((groupId, index) => ({
          restaurant_id: restaurantId,
          menu_item_id: itemId,
          group_id: groupId,
          display_order: index
        })),
        { onConflict: "menu_item_id,group_id" }
      );
    databaseFailure("Option group attach", upsertError);
  }
}

// Parses the item form's optional hidden field. Returns null when the field is
// absent so forms that don't know about option groups never clear links.
function optionGroupIdsFromForm(formData: FormData): string[] | null {
  const raw = formData.get("option_group_ids");

  if (raw === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function setItemOptionGroupsAction(formData: FormData) {
  const context = await getMenuActionContext(formData);
  const itemId = stringValue(formData, "item_id");

  if (!context || !itemId) {
    return;
  }

  const { restaurant, supabase } = context;
  const { data: item } = await supabase
    .from("menu_items")
    .select("id")
    .eq("id", itemId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  if (!item) {
    throw new Error("The selected item does not belong to this restaurant.");
  }

  await syncItemOptionGroups(
    supabase,
    restaurant.id,
    itemId,
    optionGroupIdsFromForm(formData) ?? []
  );

  revalidateMenuPaths(restaurant);
}

function updateCategoryDisplayOrder(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  category: MenuCategory,
  displayOrder: number
) {
  return supabase
    .from("menu_categories")
    .update({ display_order: displayOrder })
    .eq("id", category.id)
    .eq("restaurant_id", category.restaurant_id);
}

function storagePathFromPublicUrl(url: string, bucketName = "menu-images") {
  const marker = `/storage/v1/object/public/${bucketName}/`;
  const markerIndex = url.indexOf(marker);

  if (markerIndex < 0) {
    return null;
  }

  return decodeURIComponent(url.slice(markerIndex + marker.length).split("?")[0]);
}
