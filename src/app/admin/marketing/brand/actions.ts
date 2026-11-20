"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parsePosterBrandingForm } from "@/lib/poster/branding-input";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

// Poster colour + default look. Scoped to the session's own restaurant;
// writes go through the service-role client.
export async function updatePosterBrandingAction(formData: FormData) {
  const session = await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    redirect("/admin/marketing/brand?error=1");
  }
  const { error } = await supabase
    .from("restaurants")
    .update(parsePosterBrandingForm(formData))
    .eq("id", session.restaurantId);
  if (error) {
    console.error("WhatsOrder poster branding update failed", error.code);
    redirect("/admin/marketing/brand?error=1");
  }
  revalidatePath("/admin/marketing");
  revalidatePath("/admin/marketing/brand");
  revalidatePath("/admin/settings");
  redirect("/admin/marketing/brand?saved=1");
}
