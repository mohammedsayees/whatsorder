import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import type { Profile, Restaurant } from "@/lib/types";

export const superAdminCookieName = "whatsorder_access_token";

export type SuperAdminSession = {
  userId: string;
  email: string;
  profile: Profile;
};

export type RestaurantAdminSession = {
  userId: string;
  email: string;
  role: "restaurant_admin" | "staff" | "owner" | "manager";
  restaurantId: string;
  restaurant: Restaurant;
};

export async function getAuthenticatedUser() {
  const token = (await cookies()).get(superAdminCookieName)?.value;
  const supabase = getSupabase();

  if (!token || !supabase) {
    return null;
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) {
    return null;
  }

  return authData.user;
}

export async function getSuperAdminSession(): Promise<SuperAdminSession | null> {
  const user = await getAuthenticatedUser();
  const admin = getSupabaseAdmin();

  if (!user || !admin) {
    return null;
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();

  if (profileError || !profile) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? profile.email,
    profile: profile as Profile
  };
}

export async function requireSuperAdmin() {
  const session = await getSuperAdminSession();

  if (!session) {
    redirect("/super-admin/login");
  }

  return session;
}

export async function getRestaurantAdminSession() {
  const user = await getAuthenticatedUser();
  const admin = getSupabaseAdmin();

  if (!user || !admin) {
    return null;
  }

  const { data: membership } = await admin
    .from("restaurant_users")
    .select("restaurant_id,role,email")
    .eq("user_id", user.id)
    .in("role", ["restaurant_admin", "staff", "owner", "manager"])
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return null;
  }

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("*")
    .eq("id", membership.restaurant_id)
    .maybeSingle();

  if (!restaurant) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? membership.email,
    role: membership.role as RestaurantAdminSession["role"],
    restaurantId: membership.restaurant_id as string,
    restaurant: restaurant as Restaurant
  } satisfies RestaurantAdminSession;
}

export async function requireRestaurantAdmin() {
  const session = await getRestaurantAdminSession();

  if (!session) {
    redirect("/admin-login");
  }

  return session;
}

export async function requireRestaurantRole(
  allowedRoles: RestaurantAdminSession["role"][]
) {
  const session = await requireRestaurantAdmin();

  if (!allowedRoles.includes(session.role)) {
    redirect("/admin?error=You%20do%20not%20have%20permission%20for%20that%20action.");
  }

  return session;
}
