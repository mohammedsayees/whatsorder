"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import { requireSuperAdmin, superAdminCookieName } from "@/lib/super-admin-auth";
import type { RestaurantPlan, RestaurantStatus } from "@/lib/types";

const onboardingTaskTemplates = [
  ["restaurant_details", "Restaurant details added"],
  ["whatsapp_number", "WhatsApp number added"],
  ["menu_uploaded", "Menu uploaded or imported"],
  ["categories_created", "Categories created"],
  ["items_added", "Items added"],
  ["images_added", "Images added"],
  ["fulfilment_settings", "Delivery and pickup settings added"],
  ["qr_generated", "QR code generated"],
  ["test_order", "Test order completed"],
  ["restaurant_live", "Restaurant live"]
] as const;

const restaurantStatuses: RestaurantStatus[] = [
  "draft",
  "onboarding",
  "live",
  "trial",
  "paid",
  "paused",
  "cancelled"
];

const restaurantPlans: RestaurantPlan[] = ["trial", "starter", "growth", "pro", "custom"];

function stringValue(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function queryError(message: string) {
  return encodeURIComponent(message);
}

export async function loginSuperAdminAction(formData: FormData) {
  const email = stringValue(formData, "email").toLowerCase();
  const password = stringValue(formData, "password");
  const supabase = getSupabase();
  const admin = getSupabaseAdmin();

  if (!supabase || !admin) {
    redirect(
      `/super-admin/login?error=${queryError("Supabase environment variables are not configured.")}`
    );
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    redirect(`/super-admin/login?error=${queryError("Invalid email or password.")}`);
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profile?.role !== "super_admin") {
    await supabase.auth.signOut();
    redirect(`/super-admin/login?error=${queryError("This account does not have Super Admin access.")}`);
  }

  (await cookies()).set(superAdminCookieName, data.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, data.session.expires_in)
  });

  redirect("/super-admin");
}

export async function logoutSuperAdminAction() {
  (await cookies()).delete(superAdminCookieName);
  redirect("/super-admin/login");
}

export async function createRestaurantAction(formData: FormData) {
  await requireSuperAdmin();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    redirect(
      `/super-admin/restaurants/new?error=${queryError("Supabase server access is not configured.")}`
    );
  }

  const name = stringValue(formData, "name");
  const slug = slugify(stringValue(formData, "slug") || name);
  const whatsappNumber = normalizeWhatsAppNumber(stringValue(formData, "whatsapp_number"));
  const ownerEmail = stringValue(formData, "owner_email").toLowerCase();
  const statusValue = stringValue(formData, "status") as RestaurantStatus;
  const planValue = stringValue(formData, "plan") as RestaurantPlan;

  if (!name || !slug || !whatsappNumber) {
    redirect(
      `/super-admin/restaurants/new?error=${queryError("Restaurant name, slug, and WhatsApp number are required.")}`
    );
  }

  const status = restaurantStatuses.includes(statusValue) ? statusValue : "draft";
  const plan = restaurantPlans.includes(planValue) ? planValue : "trial";

  const { data: restaurant, error } = await supabase
    .from("restaurants")
    .insert({
      name,
      slug,
      whatsapp_number: whatsappNumber,
      owner_name: stringValue(formData, "owner_name") || null,
      owner_email: ownerEmail || null,
      owner_phone: stringValue(formData, "owner_phone") || null,
      address: stringValue(formData, "address") || null,
      city: stringValue(formData, "city") || null,
      subtitle: stringValue(formData, "subtitle") || null,
      status,
      plan,
      is_active: ["live", "trial", "paid"].includes(status)
    })
    .select("*")
    .single();

  if (error || !restaurant) {
    redirect(
      `/super-admin/restaurants/new?error=${queryError(error?.message ?? "Restaurant could not be created.")}`
    );
  }

  const now = new Date().toISOString();
  await supabase.from("onboarding_tasks").insert(
    onboardingTaskTemplates.map(([taskKey, taskLabel]) => {
      const completed =
        taskKey === "restaurant_details" ||
        (taskKey === "whatsapp_number" && Boolean(whatsappNumber)) ||
        (taskKey === "restaurant_live" && status === "live");

      return {
        restaurant_id: restaurant.id,
        task_key: taskKey,
        task_label: taskLabel,
        is_completed: completed,
        completed_at: completed ? now : null
      };
    })
  );

  if (ownerEmail) {
    await supabase.from("restaurant_users").upsert(
      {
        restaurant_id: restaurant.id,
        email: ownerEmail,
        role: "restaurant_admin"
      },
      { onConflict: "restaurant_id,email" }
    );
  }

  redirect(`/super-admin/restaurants/${restaurant.id}?created=1`);
}

export async function updateSuperAdminRestaurantAction(formData: FormData) {
  await requireSuperAdmin();
  const supabase = getSupabaseAdmin();
  const restaurantId = stringValue(formData, "restaurant_id");

  if (!supabase || !restaurantId) {
    return;
  }

  const statusValue = stringValue(formData, "status") as RestaurantStatus;
  const planValue = stringValue(formData, "plan") as RestaurantPlan;
  const status = restaurantStatuses.includes(statusValue) ? statusValue : "draft";
  const plan = restaurantPlans.includes(planValue) ? planValue : "trial";
  const slug = slugify(stringValue(formData, "slug"));

  const { error } = await supabase
    .from("restaurants")
    .update({
      name: stringValue(formData, "name"),
      slug,
      whatsapp_number: normalizeWhatsAppNumber(stringValue(formData, "whatsapp_number")),
      owner_name: stringValue(formData, "owner_name") || null,
      owner_email: stringValue(formData, "owner_email").toLowerCase() || null,
      owner_phone: stringValue(formData, "owner_phone") || null,
      logo_url: stringValue(formData, "logo_url") || null,
      cover_image_url: stringValue(formData, "cover_image_url") || null,
      address: stringValue(formData, "address") || null,
      city: stringValue(formData, "city") || null,
      subtitle: stringValue(formData, "subtitle") || null,
      delivery_fee: Number(stringValue(formData, "delivery_fee") || 0),
      pickup_enabled: formData.get("pickup_enabled") === "on",
      delivery_enabled: formData.get("delivery_enabled") === "on",
      scheduled_orders_enabled: formData.get("scheduled_orders_enabled") === "on",
      status,
      plan,
      is_active: ["live", "trial", "paid"].includes(status)
    })
    .eq("id", restaurantId);

  if (error) {
    redirect(
      `/super-admin/restaurants/${restaurantId}?tab=settings&error=${queryError(error.message)}`
    );
  }

  revalidatePath("/super-admin");
  revalidatePath("/super-admin/restaurants");
  revalidatePath(`/super-admin/restaurants/${restaurantId}`);
  revalidatePath(`/r/${slug}`);
  redirect(`/super-admin/restaurants/${restaurantId}?tab=settings&saved=1`);
}

export async function toggleOnboardingTaskAction(formData: FormData) {
  await requireSuperAdmin();
  const supabase = getSupabaseAdmin();
  const restaurantId = stringValue(formData, "restaurant_id");
  const taskId = stringValue(formData, "task_id");
  const isCompleted = stringValue(formData, "is_completed") === "true";

  if (!supabase || !restaurantId || !taskId) {
    return;
  }

  await supabase
    .from("onboarding_tasks")
    .update({
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null
    })
    .eq("id", taskId)
    .eq("restaurant_id", restaurantId);

  revalidatePath("/super-admin");
  revalidatePath("/super-admin/onboarding");
  revalidatePath(`/super-admin/restaurants/${restaurantId}`);
}

export async function updateRestaurantNotesAction(formData: FormData) {
  await requireSuperAdmin();
  const supabase = getSupabaseAdmin();
  const restaurantId = stringValue(formData, "restaurant_id");

  if (!supabase || !restaurantId) {
    return;
  }

  await supabase
    .from("restaurants")
    .update({ internal_notes: stringValue(formData, "internal_notes") || null })
    .eq("id", restaurantId);

  revalidatePath(`/super-admin/restaurants/${restaurantId}`);
  redirect(`/super-admin/restaurants/${restaurantId}?tab=notes&saved=1`);
}
