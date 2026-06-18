import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

export const superAdminCookieName = "whatsorder_access_token";

export type SuperAdminSession = {
  userId: string;
  email: string;
  profile: Profile;
};

async function getAuthenticatedUser() {
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

  const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();

  if (profile?.role === "super_admin") {
    return {
      userId: user.id,
      email: user.email ?? profile.email,
      role: "super_admin" as const,
      restaurantId: null
    };
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

  const defaultSlug = process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT_SLUG ?? "chaixpress";
  const { data: defaultRestaurant } = await admin
    .from("restaurants")
    .select("id")
    .eq("slug", defaultSlug)
    .maybeSingle();

  if (!defaultRestaurant || membership.restaurant_id !== defaultRestaurant.id) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? membership.email,
    role: membership.role,
    restaurantId: membership.restaurant_id as string
  };
}

export async function requireRestaurantAdmin() {
  const session = await getRestaurantAdminSession();

  if (!session) {
    redirect("/admin-login");
  }

  return session;
}
