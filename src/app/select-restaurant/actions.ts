"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { activeRestaurantCookieName } from "@/lib/auth-cookies";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/super-admin-auth";

export async function selectActiveRestaurantAction(formData: FormData) {
  const restaurantId = String(formData.get("restaurant_id") ?? "").trim();
  const user = await getAuthenticatedUser();
  const admin = getSupabaseAdmin();

  if (!user || !admin || !restaurantId) {
    redirect("/admin-login?error=Your%20session%20has%20expired.%20Please%20sign%20in%20again.");
  }

  // Only allow selecting a restaurant the signed-in user is actually a member
  // of. The cookie is re-validated on every request, but we also refuse to set
  // it for a restaurant the user does not belong to.
  const { data: membership } = await admin
    .from("restaurant_users")
    .select("restaurant_id")
    .eq("user_id", user.id)
    .eq("restaurant_id", restaurantId)
    .not("accepted_at", "is", null)
    .in("role", ["restaurant_admin", "staff", "owner", "manager"])
    .maybeSingle();

  if (!membership) {
    redirect("/select-restaurant?error=That%20restaurant%20is%20no%20longer%20available%20for%20this%20account.");
  }

  const cookieStore = await cookies();
  cookieStore.set(activeRestaurantCookieName, restaurantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  redirect("/admin");
}
