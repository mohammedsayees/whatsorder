"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { revalidatePublicRestaurantCache } from "@/lib/public-cache";
import { normalizeStoreSlug, storeSlugError } from "@/lib/store-slug";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

function back(params: string): never {
  redirect(`/admin/settings?${params}#store-link`);
}

// Owner/admin-only: changing the store link breaks every printed QR code and
// shared link, so managers and staff cannot do it. Scoped to the session's
// own restaurant; writes go through the service-role client.
export async function updateStoreSlugAction(formData: FormData) {
  const session = await requireRestaurantRole(["owner", "restaurant_admin"]);
  const restaurant = session.restaurant;
  const supabase = getSupabaseAdmin();
  if (!restaurant || !supabase) {
    back(`slug_error=${encodeURIComponent("Settings can't be saved right now.")}`);
  }

  const slug = normalizeStoreSlug(String(formData.get("slug") ?? ""));
  if (slug === restaurant.slug) {
    back("slug_saved=1");
  }

  const slugError = storeSlugError(slug);
  if (slugError) {
    back(`slug_error=${encodeURIComponent(slugError)}`);
  }

  const { data: taken } = await supabase
    .from("restaurants")
    .select("id")
    .eq("slug", slug)
    .neq("id", restaurant.id)
    .maybeSingle();
  if (taken) {
    back(`slug_error=${encodeURIComponent("That store link is already taken. Try another one.")}`);
  }

  const { error } = await supabase
    .from("restaurants")
    .update({ slug })
    .eq("id", restaurant.id);

  if (error) {
    const message = error.message.includes("restaurants_slug_key")
      ? "That store link is already taken. Try another one."
      : "Your store link could not be saved. Try again in a moment.";
    back(`slug_error=${encodeURIComponent(message)}`);
  }

  revalidatePublicRestaurantCache({ id: restaurant.id, slug: restaurant.slug });
  revalidatePublicRestaurantCache({ id: restaurant.id, slug });
  revalidatePath(`/r/${restaurant.slug}`);
  revalidatePath(`/r/${slug}`);
  revalidatePath("/admin", "layout");
  back("slug_saved=1");
}
