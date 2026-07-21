"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { revalidatePublicRestaurantCache } from "@/lib/public-cache";
import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp";
import { openingHoursFromFormData } from "@/lib/opening-hours";
import {
  refreshTokenCookieName,
  requireSuperAdmin,
  superAdminCookieName
} from "@/lib/super-admin-auth";
import {
  inviteRestaurantUser,
  type RestaurantInviteRole as InviteRole
} from "@/lib/restaurant-invitations";
import type { RestaurantPlan, RestaurantStatus } from "@/lib/types";
import { revokeCurrentAuthSession } from "@/lib/auth-session-revocation";
import {
  countryProfileFields,
  getCountryProfile,
  isCountryCode
} from "@/lib/localization";

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

const restaurantPlans: RestaurantPlan[] = ["trial", "starter", "pro", "multi_branch"];

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

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  } as const;
  cookieStore.set(superAdminCookieName, data.session.access_token, {
    ...cookieOptions,
    maxAge: Math.max(60, data.session.expires_in)
  });
  cookieStore.set(refreshTokenCookieName, data.session.refresh_token, {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30
  });

  redirect("/super-admin");
}

export async function logoutSuperAdminAction() {
  await revokeCurrentAuthSession();
  const cookieStore = await cookies();
  cookieStore.delete(superAdminCookieName);
  cookieStore.delete(refreshTokenCookieName);
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
  const submittedCountryCode = stringValue(formData, "country_code");
  const countryCode = isCountryCode(submittedCountryCode) ? submittedCountryCode : "AE";
  const countryProfile = getCountryProfile(countryCode);
  const whatsappNumber = normalizeWhatsAppNumber(
    stringValue(formData, "whatsapp_number"),
    countryProfile.phoneCountryCode
  );
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
      ...countryProfileFields(countryCode),
      owner_name: stringValue(formData, "owner_name") || null,
      owner_email: ownerEmail || null,
      owner_phone:
        normalizeWhatsAppNumber(
          stringValue(formData, "owner_phone"),
          countryProfile.phoneCountryCode
        ) || null,
      address: stringValue(formData, "address") || null,
      city: stringValue(formData, "city") || null,
      subtitle: stringValue(formData, "subtitle") || null,
      delivery_fee: Number(stringValue(formData, "delivery_fee") || 0),
      minimum_order_amount: Number(stringValue(formData, "minimum_order_amount") || 0),
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
  const { error: onboardingError } = await supabase.from("onboarding_tasks").insert(
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
  if (onboardingError) {
    await supabase.from("restaurants").delete().eq("id", restaurant.id);
    redirect(
      `/super-admin/restaurants/new?error=${queryError(`Onboarding setup failed: ${onboardingError.message}`)}`
    );
  }

  // A pre-launch probe of the public URL may have cached a not-found for this
  // slug — clear it so the new restaurant is reachable immediately.
  revalidatePublicRestaurantCache({ id: restaurant.id, slug });

  if (ownerEmail) {
    const { error: ownerMembershipError } = await supabase.from("restaurant_users").upsert(
      {
        restaurant_id: restaurant.id,
        email: ownerEmail,
        role: "restaurant_admin"
      },
      { onConflict: "restaurant_id,email" }
    );
    if (ownerMembershipError) {
      redirect(
        `/super-admin/restaurants/${restaurant.id}?created=1&invite_error=${queryError(ownerMembershipError.message)}`
      );
    }

    if (formData.get("send_owner_invite") === "on") {
      const inviteResult = await inviteRestaurantUser(
        supabase,
        restaurant.id,
        ownerEmail,
        "restaurant_admin"
      );

      if (!inviteResult.ok) {
        redirect(
          `/super-admin/restaurants/${restaurant.id}?created=1&invite_error=${queryError(inviteResult.error)}`
        );
      }

      redirect(
        `/super-admin/restaurants/${restaurant.id}?created=1&invited=${queryError(inviteResult.message)}`
      );
    }
  }

  redirect(`/super-admin/restaurants/${restaurant.id}?created=1`);
}

// Instant demo stores (funnel Phase 2): promote a self-serve demo tenant to a
// real one in place — same slug, same menu, same order history. Requires the
// restaurant's real WhatsApp number because demo tenants point at the founder
// number; promoting without changing it would misroute customer orders.
export async function promoteDemoRestaurantAction(formData: FormData) {
  await requireSuperAdmin();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    redirect("/super-admin/restaurants?error=" + queryError("Supabase is not configured."));
  }

  const restaurantId = stringValue(formData, "restaurant_id");
  const detailUrl = `/super-admin/restaurants/${restaurantId}`;

  const { data: demo } = await supabase
    .from("restaurants")
    .select("id, slug, name, country_code, owner_phone")
    .eq("id", restaurantId)
    .eq("is_demo", true)
    .maybeSingle();

  if (!demo) {
    redirect(`${detailUrl}?error=${queryError("This restaurant is not a demo store.")}`);
  }

  const countryProfile = getCountryProfile(demo.country_code);
  const whatsappNumber = normalizeWhatsAppNumber(
    stringValue(formData, "whatsapp_number"),
    countryProfile.phoneCountryCode
  );

  if (!whatsappNumber) {
    redirect(
      `${detailUrl}?error=${queryError("Enter the restaurant's real WhatsApp number to promote it.")}`
    );
  }

  const { error: promoteError } = await supabase
    .from("restaurants")
    .update({
      is_demo: false,
      demo_expires_at: null,
      demo_ip_hash: null,
      whatsapp_number: whatsappNumber,
      subtitle: null,
      status: "onboarding"
    })
    .eq("id", demo.id)
    .eq("is_demo", true);

  if (promoteError) {
    redirect(`${detailUrl}?error=${queryError(promoteError.message)}`);
  }

  // Seed the same onboarding checklist real tenants get at creation. The demo
  // build already covered the menu steps; mark those done so the checklist
  // reflects reality.
  const now = new Date().toISOString();
  const preCompleted = new Set([
    "restaurant_details",
    "whatsapp_number",
    "menu_uploaded",
    "categories_created",
    "items_added"
  ]);
  await supabase.from("onboarding_tasks").upsert(
    onboardingTaskTemplates.map(([taskKey, taskLabel]) => ({
      restaurant_id: demo.id,
      task_key: taskKey,
      task_label: taskLabel,
      is_completed: preCompleted.has(taskKey),
      completed_at: preCompleted.has(taskKey) ? now : null
    })),
    { onConflict: "restaurant_id,task_key", ignoreDuplicates: true }
  );

  revalidatePublicRestaurantCache({ id: demo.id, slug: demo.slug });
  revalidatePath(`/r/${demo.slug}`);
  revalidatePath("/super-admin/restaurants");
  redirect(`${detailUrl}?saved=1`);
}

export async function inviteRestaurantOwnerAction(formData: FormData) {
  await requireSuperAdmin();
  const supabase = getSupabaseAdmin();
  const restaurantId = stringValue(formData, "restaurant_id");
  const email = stringValue(formData, "owner_email").toLowerCase();

  if (!supabase || !restaurantId || !email) {
    return;
  }

  const result = await inviteRestaurantUser(supabase, restaurantId, email, "restaurant_admin");

  if (!result.ok) {
    redirect(
      `/super-admin/restaurants/${restaurantId}?invite_error=${queryError(result.error)}`
    );
  }

  revalidatePath(`/super-admin/restaurants/${restaurantId}`);
  redirect(
    `/super-admin/restaurants/${restaurantId}?invited=${queryError(result.message)}`
  );
}

export async function inviteRestaurantUserAction(formData: FormData) {
  await requireSuperAdmin();
  const supabase = getSupabaseAdmin();
  const restaurantId = stringValue(formData, "restaurant_id");
  const email = stringValue(formData, "email").toLowerCase();
  const requestedRole = stringValue(formData, "role") as InviteRole;
  const role: InviteRole = ["restaurant_admin", "manager", "staff"].includes(requestedRole)
    ? requestedRole
    : "staff";

  if (!supabase || !restaurantId || !email) {
    return;
  }

  const result = await inviteRestaurantUser(supabase, restaurantId, email, role);

  if (!result.ok) {
    redirect(
      `/super-admin/restaurants/${restaurantId}?invite_error=${queryError(result.error)}`
    );
  }

  revalidatePath(`/super-admin/restaurants/${restaurantId}`);
  redirect(
    `/super-admin/restaurants/${restaurantId}?invited=${queryError(result.message)}`
  );
}

export async function revokeRestaurantUserAccessAction(formData: FormData) {
  await requireSuperAdmin();
  const supabase = getSupabaseAdmin();
  const restaurantId = stringValue(formData, "restaurant_id");
  const membershipId = stringValue(formData, "membership_id");

  if (!supabase || !restaurantId || !membershipId) {
    return;
  }

  const { data: membership, error: membershipLookupError } = await supabase
    .from("restaurant_users")
    .select("id,email,role")
    .eq("id", membershipId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (membershipLookupError || !membership) {
    redirect(
      `/super-admin/restaurants/${restaurantId}?error=${queryError(
        membershipLookupError?.message ?? "Restaurant user could not be found."
      )}`
    );
  }

  if (["restaurant_admin", "owner"].includes(String(membership.role))) {
    redirect(
      `/super-admin/restaurants/${restaurantId}?error=${queryError(
        "Owner access must be transferred before it can be revoked."
      )}`
    );
  }

  const { error } = await supabase
    .from("restaurant_users")
    .delete()
    .eq("id", membershipId)
    .eq("restaurant_id", restaurantId);

  if (error) {
    redirect(
      `/super-admin/restaurants/${restaurantId}?error=${queryError(error.message)}`
    );
  }

  revalidatePath(`/super-admin/restaurants/${restaurantId}`);
  redirect(
    `/super-admin/restaurants/${restaurantId}?access_revoked=${queryError(
      `Access revoked for ${membership.email}.`
    )}`
  );
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
  // The slug can change here — capture the current one so the old slug's
  // cached public entry is invalidated alongside the new one. Country is
  // intentionally immutable after onboarding because changing it would
  // reinterpret historical money and phone data without conversion.
  const { data: existingRestaurant } = await supabase
    .from("restaurants")
    .select("slug, country_code")
    .eq("id", restaurantId)
    .maybeSingle();
  const countryCode = isCountryCode(existingRestaurant?.country_code)
    ? existingRestaurant.country_code
    : "AE";
  const countryProfile = getCountryProfile(countryCode);

  const { error } = await supabase
    .from("restaurants")
    .update({
      name: stringValue(formData, "name"),
      slug,
      whatsapp_number: normalizeWhatsAppNumber(
        stringValue(formData, "whatsapp_number"),
        countryProfile.phoneCountryCode
      ),
      ...countryProfileFields(countryCode),
      owner_name: stringValue(formData, "owner_name") || null,
      owner_email: stringValue(formData, "owner_email").toLowerCase() || null,
      owner_phone:
        normalizeWhatsAppNumber(
          stringValue(formData, "owner_phone"),
          countryProfile.phoneCountryCode
        ) || null,
      logo_url: stringValue(formData, "logo_url") || null,
      cover_image_url: stringValue(formData, "cover_image_url") || null,
      address: stringValue(formData, "address") || null,
      city: stringValue(formData, "city") || null,
      subtitle: stringValue(formData, "subtitle") || null,
      delivery_fee: Number(stringValue(formData, "delivery_fee") || 0),
      minimum_order_amount: Number(stringValue(formData, "minimum_order_amount") || 0),
      pickup_enabled: formData.get("pickup_enabled") === "on",
      car_pickup_enabled: formData.get("car_pickup_enabled") === "on",
      dine_in_enabled: formData.get("dine_in_enabled") === "on",
      delivery_enabled: formData.get("delivery_enabled") === "on",
      scheduled_orders_enabled: formData.get("scheduled_orders_enabled") === "on",
      public_reviews_enabled: formData.get("public_reviews_enabled") === "on",
      accepting_orders: formData.get("accepting_orders") === "on",
      opening_hours_enabled: formData.get("opening_hours_enabled") === "on",
      opening_hours: openingHoursFromFormData(formData),
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
  revalidatePublicRestaurantCache({ id: restaurantId, slug });
  if (existingRestaurant?.slug && existingRestaurant.slug !== slug) {
    revalidatePublicRestaurantCache({
      id: restaurantId,
      slug: existingRestaurant.slug
    });
  }
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

  const { error } = await supabase
    .from("onboarding_tasks")
    .update({
      is_completed: isCompleted,
      completed_at: isCompleted ? new Date().toISOString() : null
    })
    .eq("id", taskId)
    .eq("restaurant_id", restaurantId);
  if (error) {
    throw new Error(`Onboarding task update failed: ${error.message}`);
  }

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

  const { error } = await supabase
    .from("restaurants")
    .update({ internal_notes: stringValue(formData, "internal_notes") || null })
    .eq("id", restaurantId);
  if (error) {
    redirect(
      `/super-admin/restaurants/${restaurantId}?tab=notes&error=${queryError(error.message)}`
    );
  }

  revalidatePath(`/super-admin/restaurants/${restaurantId}`);
  redirect(`/super-admin/restaurants/${restaurantId}?tab=notes&saved=1`);
}
