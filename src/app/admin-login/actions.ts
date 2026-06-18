"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import {
  getSuperAdminSession,
  refreshTokenCookieName,
  resolveRestaurantAdminSession,
  superAdminCookieName
} from "@/lib/super-admin-auth";

function setAuthCookies(accessToken: string, refreshToken: string, expiresIn: number) {
  return cookies().then((cookieStore) => {
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/"
    };

    cookieStore.set(superAdminCookieName, accessToken, {
      ...options,
      maxAge: Math.max(60, expiresIn)
    });
    cookieStore.set(refreshTokenCookieName, refreshToken, {
      ...options,
      maxAge: 60 * 60 * 24 * 30
    });
  });
}

async function clearAuthCookies() {
  const cookieStore = await cookies();
  cookieStore.delete(superAdminCookieName);
  cookieStore.delete(refreshTokenCookieName);
}

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

  await setAuthCookies(
    data.session.access_token,
    data.session.refresh_token,
    data.session.expires_in
  );

  if (await getSuperAdminSession()) {
    redirect("/super-admin");
  }

  const resolution = await resolveRestaurantAdminSession();

  if (!resolution.session) {
    await clearAuthCookies();
    const messages = {
      not_authenticated: "The sign-in session could not be verified.",
      no_membership: "This account is not assigned to an active restaurant.",
      multiple_memberships:
        "This account is assigned to multiple restaurants. Contact WhatsOrder support to choose an active restaurant.",
      restaurant_unavailable: "This restaurant account is currently paused or unavailable."
    } as const;
    redirect(`/admin-login?error=${encodeURIComponent(messages[resolution.issue])}`);
  }

  redirect("/admin");
}

export async function logoutRestaurantAdminAction() {
  await clearAuthCookies();
  redirect("/admin-login");
}
