"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { sanitizeAttributionSource } from "@/lib/attribution";
import {
  getMenu,
  getMenuOffers,
  getMenuOptionCatalog,
  getRestaurantBySlug
} from "@/lib/data";
import { getSupabaseAdmin } from "@/lib/supabase";
import { checkPendingOrderCaps } from "@/lib/pending-order-caps";
import {
  buildWhatsAppAppUrl,
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  normalizeCustomerPhone
} from "@/lib/whatsapp";
import { getCustomerLanguage } from "@/lib/customer-i18n";
import { isRestaurantOpen } from "@/lib/opening-hours";
import { isValidCustomerPhone, parseAndValidateCart } from "@/lib/security";
import { verifyCartAgainstMenu } from "@/lib/order-pricing";
import { loyaltyLineForOrder } from "@/lib/loyalty-progress";
import {
  getConfiguredWebPushPublicKey,
  setOrderPushAuthorization
} from "@/lib/push-auth";
import { isFulfilmentEnabled } from "@/lib/fulfilment";
import { evaluateDeliveryRange } from "@/lib/geo";
import { formatCurrency } from "@/lib/currency";
import { getRestaurantAdminSession } from "@/lib/super-admin-auth";
import type { CartLine, FulfilmentType, PaymentMethod } from "@/lib/types";

type CreateOrderResult =
  | {
      ok: true;
      onboardingTest: boolean;
      orderId: string;
      confirmationUrl: string | null;
      webPushPublicKey: string | null;
      whatsappUrl: string;
      whatsappAppUrl: string;
    }
  | { ok: false; error: string; fallbackWhatsappUrl?: string };

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

  const onboardingRequested = stringValue(formData, "onboarding_test") === "true";
  const onboardingSession = onboardingRequested
    ? await getRestaurantAdminSession()
    : null;
  const onboardingTest =
    onboardingSession?.restaurantId === restaurant.id &&
    onboardingSession.role !== "staff";

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

  let menu: Awaited<ReturnType<typeof getMenu>>;
  let offers: Awaited<ReturnType<typeof getMenuOffers>>;
  let optionCatalog: Awaited<ReturnType<typeof getMenuOptionCatalog>>;
  try {
    // failClosed: never price an order against an empty option catalog.
    [menu, offers, optionCatalog] = await Promise.all([
      getMenu(restaurant.id),
      getMenuOffers(restaurant.id),
      getMenuOptionCatalog(restaurant.id, { failClosed: true })
    ]);
  } catch {
    return {
      ok: false,
      error: "Ordering is temporarily unavailable. Please try again in a moment."
    };
  }
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
  const attributionSource = sanitizeAttributionSource(formData.get("attribution_source"));
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

  const cap = await checkPendingOrderCaps(supabase, {
    restaurantId: restaurant.id,
    customerPhone,
    submissionToken
  });
  if (cap === "phone_limit") {
    return {
      ok: false,
      error: `You already have orders waiting for ${restaurant.name} to accept. Please wait for them to be confirmed before placing another.`
    };
  }
  if (cap === "restaurant_limit" || cap === "unavailable") {
    return {
      ok: false,
      error: "This restaurant is very busy right now. Please try again in a few minutes.",
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

  const { data, error } = await supabase.rpc("create_order_with_customer_v5", {
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

  const persistedOrder = data as {
    order_id?: string;
    whatsapp_message?: string | null;
  } | null;
  const orderId = String(persistedOrder?.order_id ?? "");
  if (!orderId) {
    return {
      ok: false,
      error: "This order was saved, but its confirmation could not be loaded. Please contact the restaurant."
    };
  }
  if (attributionSource) {
    // Marketing attribution (e.g. a poster link). Deliberately outside the
    // order RPC: it runs after the response, is first-touch only (never
    // overwrites), and can never fail or slow the order.
    after(() => recordOrderAttribution(restaurant.id, orderId, attributionSource));
  }
  const confirmationAuthorized = await setOrderPushAuthorization({
    orderId,
    restaurantId: restaurant.id
  });
  const persistedMessage = String(
    persistedOrder?.whatsapp_message ?? whatsappMessage
  );
  // Do not revalidate /r/[slug] here: the menu is edge-cached (force-static,
  // revalidate 300) and nothing on it depends on orders. Purging it on every
  // order made the next menu visitor wait for a full re-render from the origin.
  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/customers");

  return {
    ok: true,
    onboardingTest,
    // Future WhatsApp Business API support can replace this click-to-WhatsApp URL with a template send.
    orderId,
    confirmationUrl: confirmationAuthorized
      ? `/r/${restaurant.slug}/thank-you?order=${encodeURIComponent(orderId)}`
      : null,
    webPushPublicKey: getConfiguredWebPushPublicKey(),
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

async function recordOrderAttribution(
  restaurantId: string,
  orderId: string,
  source: string
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return;
  }
  const { error } = await supabase
    .from("orders")
    .update({ attribution_source: source })
    .eq("restaurant_id", restaurantId)
    .eq("id", orderId)
    .is("attribution_source", null);
  if (error) {
    console.error("WhatsOrder order attribution failed", {
      code: error.code,
      restaurantId
    });
  }
}
