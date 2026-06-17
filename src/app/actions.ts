"use server";

import { revalidatePath } from "next/cache";
import { getDefaultRestaurant, getMenu, getRestaurantBySlug } from "@/lib/data";
import { demoCustomers } from "@/lib/demo-data";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildWhatsAppAppUrl, buildWhatsAppMessage, buildWhatsAppUrl } from "@/lib/whatsapp";
import { getCustomerLanguage } from "@/lib/customer-i18n";
import type { CartLine, MenuCategory, OrderStatus, PaymentMethod } from "@/lib/types";

type CreateOrderResult =
  | { ok: true; orderId: string; whatsappUrl: string; whatsappAppUrl: string }
  | { ok: false; error: string };

type SavedCustomerLookupResult =
  | {
      ok: true;
      found: true;
      customer: {
        name: string;
        phone: string;
        deliveryArea: string;
        deliveryAddress: string;
        deliveryLandmark: string;
        latitude: number | null;
        longitude: number | null;
        googleMapsUrl: string;
        addressText: string;
        marketingOptIn: boolean;
      };
    }
  | { ok: true; found: false }
  | { ok: false; error: string };

const statusValues: OrderStatus[] = [
  "New",
  "Accepted",
  "Preparing",
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

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function decimalValue(formData: FormData, key: string) {
  const raw = stringValue(formData, key);
  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
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
      name_ar: item.name_ar ? String(item.name_ar) : null,
      quantity: Number(item.quantity),
      price: Number(item.price)
    }));
}

export async function lookupSavedCustomerAction(
  restaurantSlug: string,
  phone: string
): Promise<SavedCustomerLookupResult> {
  const cleanPhone = phone.trim();

  if (cleanPhone.length < 6) {
    return { ok: true, found: false };
  }

  const restaurant = await getRestaurantBySlug(restaurantSlug);

  if (!restaurant) {
    return { ok: false, error: "Restaurant not found." };
  }

  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data, error } = await supabase
      .from("customers")
      .select(
        "name,phone,delivery_area,delivery_address,default_latitude,default_longitude,default_google_maps_url,default_address_text,default_landmark,marketing_opt_in"
      )
      .eq("restaurant_id", restaurant.id)
      .eq("phone", cleanPhone)
      .maybeSingle();

    if (error) {
      return { ok: false, error: "Could not check saved details. Please continue manually." };
    }

    if (data) {
      return {
        ok: true,
        found: true,
        customer: {
          name: String(data.name ?? ""),
          phone: String(data.phone ?? cleanPhone),
          deliveryArea: String(data.delivery_area ?? ""),
          deliveryAddress: String(data.delivery_address ?? ""),
          deliveryLandmark: String(data.default_landmark ?? ""),
          latitude: data.default_latitude === null ? null : Number(data.default_latitude),
          longitude: data.default_longitude === null ? null : Number(data.default_longitude),
          googleMapsUrl: String(data.default_google_maps_url ?? ""),
          addressText: String(data.default_address_text ?? data.delivery_address ?? ""),
          marketingOptIn: Boolean(data.marketing_opt_in)
        }
      };
    }
  }

  const demoCustomer = demoCustomers.find(
    (customer) => customer.restaurant_id === restaurant.id && customer.phone === cleanPhone
  );

  if (demoCustomer) {
    return {
      ok: true,
      found: true,
      customer: {
        name: demoCustomer.name,
        phone: demoCustomer.phone,
        deliveryArea: demoCustomer.delivery_area,
        deliveryAddress: demoCustomer.delivery_address,
        deliveryLandmark: demoCustomer.default_landmark ?? "",
        latitude: demoCustomer.default_latitude,
        longitude: demoCustomer.default_longitude,
        googleMapsUrl: demoCustomer.default_google_maps_url ?? "",
        addressText: demoCustomer.default_address_text ?? demoCustomer.delivery_address,
        marketingOptIn: demoCustomer.marketing_opt_in
      }
    };
  }

  return { ok: true, found: false };
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

  const menu = await getMenu(restaurant.id);
  const menuItems = new Map(menu.items.map((item) => [item.id, item]));
  const verifiedItems: CartLine[] = [];

  for (const cartItem of items) {
    const menuItem = menuItems.get(cartItem.item_id);

    if (!menuItem || !menuItem.is_available) {
      return {
        ok: false,
        error: `${cartItem.name || "One item"} is no longer available. Please review your cart.`
      };
    }

    verifiedItems.push({
      item_id: menuItem.id,
      name: menuItem.name,
      name_ar: menuItem.name_ar ?? null,
      price: menuItem.price,
      quantity: Math.max(1, Math.floor(cartItem.quantity))
    });
  }

  const customerName = stringValue(formData, "customer_name");
  const customerPhone = stringValue(formData, "customer_phone");
  const deliveryArea = stringValue(formData, "delivery_area");
  const deliveryAddress = stringValue(formData, "delivery_address");
  const deliveryLandmark = stringValue(formData, "delivery_landmark");
  const deliveryLatitude = decimalValue(formData, "delivery_latitude");
  const deliveryLongitude = decimalValue(formData, "delivery_longitude");
  const submittedMapsUrl = stringValue(formData, "delivery_google_maps_url");
  const deliveryGoogleMapsUrl =
    submittedMapsUrl ||
    (deliveryLatitude !== null && deliveryLongitude !== null
      ? `https://www.google.com/maps?q=${deliveryLatitude},${deliveryLongitude}`
      : "");
  const deliveryPlaceId = stringValue(formData, "delivery_place_id");
  // Future Google Places Autocomplete can populate delivery_address_text and delivery_place_id here.
  const deliveryAddressText = stringValue(formData, "delivery_address_text") || deliveryAddress;
  const notes = stringValue(formData, "notes");
  const paymentMethod = stringValue(formData, "payment_method") as PaymentMethod;
  const orderLanguage = getCustomerLanguage(formData.get("order_language"));
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

  const subtotal = verifiedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

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
    deliveryLandmark,
    deliveryGoogleMapsUrl,
    notes,
    paymentMethod,
    items: verifiedItems,
    subtotal,
    deliveryFee: restaurant.delivery_fee,
    total,
    language: orderLanguage
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
        delivery_latitude: deliveryLatitude,
        delivery_longitude: deliveryLongitude,
        delivery_google_maps_url: deliveryGoogleMapsUrl || null,
        delivery_place_id: deliveryPlaceId || null,
        delivery_address_text: deliveryAddressText || null,
        delivery_landmark: deliveryLandmark || null,
        notes: notes || null,
        payment_method: paymentMethod,
        items: verifiedItems,
        subtotal,
        delivery_fee: restaurant.delivery_fee,
        total,
        points_earned: 0,
        points_redeemed: 0,
        loyalty_discount: 0,
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
          default_latitude: deliveryLatitude,
          default_longitude: deliveryLongitude,
          default_google_maps_url: deliveryGoogleMapsUrl || null,
          default_address_text: deliveryAddressText || null,
          default_landmark: deliveryLandmark || null,
          total_orders: Number(existingCustomer.total_orders ?? 0) + 1,
          total_spend: Number(existingCustomer.total_spend ?? 0) + total,
          last_order_at: consentTimestamp,
          marketing_opt_in: consentMarketing,
          consent_order_processing: consentOrderProcessing,
          consent_marketing: consentMarketing,
          consent_timestamp: consentTimestamp,
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
        default_latitude: deliveryLatitude,
        default_longitude: deliveryLongitude,
        default_google_maps_url: deliveryGoogleMapsUrl || null,
        default_address_text: deliveryAddressText || null,
        default_landmark: deliveryLandmark || null,
        total_orders: 1,
        total_spend: total,
        last_order_at: consentTimestamp,
        marketing_opt_in: consentMarketing,
        consent_order_processing: consentOrderProcessing,
        consent_marketing: consentMarketing,
        consent_timestamp: consentTimestamp,
        loyalty_points_balance: 0,
        lifetime_points_earned: 0,
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
    whatsappUrl: buildWhatsAppUrl(restaurant.whatsapp_number, message),
    whatsappAppUrl: buildWhatsAppAppUrl(restaurant.whatsapp_number, message)
  };
}

export async function updateOrderStatusAction(formData: FormData) {
  const orderId = stringValue(formData, "order_id");
  const status = stringValue(formData, "status") as OrderStatus;
  const restaurant = await getDefaultRestaurant();
  const supabase = getSupabaseAdmin();

  if (!restaurant || !orderId || !statusValues.includes(status)) {
    return;
  }

  if (supabase) {
    const { data: order } = await supabase
      .from("orders")
      .select("id,total,status,points_earned,customer_phone")
      .eq("id", orderId)
      .eq("restaurant_id", restaurant.id)
      .maybeSingle();

    await supabase
      .from("orders")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("restaurant_id", restaurant.id);

    if (status === "Completed" && order && Number(order.points_earned ?? 0) <= 0) {
      const pointsEarned = Math.floor(Number(order.total ?? 0));

      if (pointsEarned > 0) {
        const { data: customer } = await supabase
          .from("customers")
          .select("id,loyalty_points_balance,lifetime_points_earned")
          .eq("restaurant_id", restaurant.id)
          .eq("phone", String(order.customer_phone))
          .maybeSingle();

        if (customer) {
          const newBalance = Number(customer.loyalty_points_balance ?? 0) + pointsEarned;
          const newLifetime = Number(customer.lifetime_points_earned ?? 0) + pointsEarned;

          await supabase
            .from("customers")
            .update({
              loyalty_points_balance: newBalance,
              lifetime_points_earned: newLifetime
            })
            .eq("id", customer.id)
            .eq("restaurant_id", restaurant.id);

          await supabase.from("loyalty_transactions").insert({
            restaurant_id: restaurant.id,
            customer_id: customer.id,
            order_id: order.id,
            type: "earned",
            points: pointsEarned,
            description: `Earned ${pointsEarned} points for completed order`
          });

          await supabase
            .from("orders")
            .update({ points_earned: pointsEarned })
            .eq("id", order.id)
            .eq("restaurant_id", restaurant.id);
        }
      }
    }
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
    name_ar: stringValue(formData, "name_ar") || null,
    description: stringValue(formData, "description") || null,
    description_ar: stringValue(formData, "description_ar") || null,
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
      name_ar: stringValue(formData, "name_ar") || null,
      description: stringValue(formData, "description") || null,
      description_ar: stringValue(formData, "description_ar") || null,
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

export async function uploadMenuItemImageAction(formData: FormData): Promise<UploadMenuImageResult> {
  const restaurantSlug = process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG ?? "chaixpress";
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  const supabase = getSupabaseAdmin();
  const file = formData.get("image");
  const itemName = stringValue(formData, "item_name") || "menu-item";
  const itemId = stringValue(formData, "item_id");

  if (!restaurant || !supabase) {
    return { ok: false, error: "Image upload needs Supabase Storage access." };
  }

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Please choose an image to upload." };
  }

  const allowedTypes = new Map([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"]
  ]);
  const extension = allowedTypes.get(file.type);

  if (!extension) {
    return { ok: false, error: "Only JPG, PNG, and WebP images are allowed." };
  }

  if (file.size > 2 * 1024 * 1024) {
    return { ok: false, error: "Image must be 2MB or smaller." };
  }

  const bucketName = "menu-images";
  const itemSlug = slugify(itemName) || "menu-item";
  const filePath = `restaurants/${restaurant.slug}/${itemSlug}-${Date.now()}.${extension}`;
  const bytes = await file.arrayBuffer();

  const uploadFile = () =>
    supabase.storage
      .from(bucketName)
      .upload(filePath, bytes, {
        contentType: file.type,
        upsert: false
      });

  let { error: uploadError } = await uploadFile();

  if (uploadError && uploadError.message.toLowerCase().includes("bucket")) {
    const { error: bucketError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 2 * 1024 * 1024,
      allowedMimeTypes: [...allowedTypes.keys()]
    });

    if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
      return { ok: false, error: bucketError.message };
    }

    const retry = await uploadFile();
    uploadError = retry.error;
  }

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
  const publicUrl = data.publicUrl;

  if (itemId) {
    await supabase
      .from("menu_items")
      .update({ image_url: publicUrl })
      .eq("id", itemId)
      .eq("restaurant_id", restaurant.id);

    revalidatePath("/admin/menu");
    revalidatePath(`/r/${restaurant.slug}`);
  }

  return { ok: true, publicUrl, message: "Image uploaded successfully." };
}

export async function removeMenuItemImageAction(formData: FormData) {
  const itemId = stringValue(formData, "item_id");
  const restaurantSlug = process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG ?? "chaixpress";
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  const supabase = getSupabaseAdmin();

  if (!restaurant || !supabase || !itemId) {
    return;
  }

  await supabase
    .from("menu_items")
    .update({ image_url: null })
    .eq("id", itemId)
    .eq("restaurant_id", restaurant.id);

  revalidatePath("/admin/menu");
  revalidatePath(`/r/${restaurant.slug}`);
}

export async function toggleMenuItemAvailabilityAction(formData: FormData) {
  const itemId = stringValue(formData, "item_id");
  const isAvailable = stringValue(formData, "is_available") === "true";
  const restaurantSlug = process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG ?? "chaixpress";
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  const supabase = getSupabaseAdmin();

  if (!restaurant || !supabase || !itemId) {
    return;
  }

  await supabase
    .from("menu_items")
    .update({ is_available: isAvailable })
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

export async function importMenuRowsAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const restaurantSlug = process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG ?? "chaixpress";
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  const menu = restaurant ? await getMenu(restaurant.id, { admin: true }) : null;
  const supabase = getSupabaseAdmin();
  const rawRows = stringValue(formData, "rows");

  if (!restaurant || !menu || !supabase) {
    return { ok: false, message: "Menu import needs Supabase write access." };
  }

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

    const { data } = await supabase
      .from("menu_categories")
      .insert({
        restaurant_id: restaurant.id,
        name: categoryName,
        display_order: categoriesByName.size + 1,
        is_active: true
      })
      .select("*")
      .single();

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

  revalidatePath("/admin/menu");
  revalidatePath(`/r/${restaurant.slug}`);

  return { ok: true, message: `Imported ${itemsToInsert.length} menu items.` };
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
      name_ar: stringValue(formData, "name_ar") || null,
      whatsapp_number: stringValue(formData, "whatsapp_number"),
      address: stringValue(formData, "address") || null,
      address_ar: stringValue(formData, "address_ar") || null,
      subtitle_ar: stringValue(formData, "subtitle_ar") || null,
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
  const menu = restaurant ? await getMenu(restaurant.id, { admin: true }) : null;
  const supabase = getSupabaseAdmin();

  if (!restaurant || !menu || !supabase) {
    return;
  }

  await supabase.from("menu_categories").insert({
    restaurant_id: restaurant.id,
    name: stringValue(formData, "name"),
    name_ar: stringValue(formData, "name_ar") || null,
    display_order: menu.categories.length + 1,
    is_active: true
  });

  revalidatePath("/admin/menu");
  revalidatePath(`/r/${restaurant.slug}`);
}

export async function moveCategoryAction(formData: FormData) {
  const categoryId = stringValue(formData, "category_id");
  const direction = stringValue(formData, "direction");
  const restaurantSlug = process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG ?? "chaixpress";
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  const menu = restaurant ? await getMenu(restaurant.id, { admin: true }) : null;
  const supabase = getSupabaseAdmin();

  if (!restaurant || !menu || !supabase || !categoryId || !["up", "down"].includes(direction)) {
    return;
  }

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

  revalidatePath("/admin/menu");
  revalidatePath(`/r/${restaurant.slug}`);
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
