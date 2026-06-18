"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import {
  getRestaurantAdminSession,
  getSuperAdminSession,
  superAdminCookieName
} from "@/lib/super-admin-auth";

export async function loginRestaurantAdminAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const supabase = getSupabase();

  if (!supabase) {
    redirect("/admin-login?error=Supabase%20is%20not%20configured.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    redirect("/admin-login?error=Invalid%20email%20or%20password.");
  }

  (await cookies()).set(superAdminCookieName, data.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, data.session.expires_in)
  });

  if (await getSuperAdminSession()) {
    redirect("/super-admin");
  }

  const session = await getRestaurantAdminSession();

  if (!session) {
    (await cookies()).delete(superAdminCookieName);
    redirect("/admin-login?error=This%20account%20is%20not%20assigned%20to%20a%20restaurant.");
  }

  redirect("/admin");
}

export async function logoutRestaurantAdminAction() {
  (await cookies()).delete(superAdminCookieName);
  redirect("/admin-login");
}
