"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import {
  getAuthenticatedUser,
  superAdminCookieName
} from "@/lib/super-admin-auth";

type InvitePayload = {
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  tokenHash?: string;
};

function inviteError(message: string): never {
  redirect(`/auth/invite?error=${encodeURIComponent(message)}`);
}

export async function completeRestaurantInviteAction(payload: InvitePayload) {
  const supabase = getSupabase();
  const admin = getSupabaseAdmin();

  if (!supabase || !admin) {
    inviteError("Supabase authentication is not configured.");
  }

  let accessToken = payload.accessToken ?? "";
  let expiresIn = 3600;

  if (!accessToken && payload.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(payload.code);

    if (error || !data.session) {
      inviteError(error?.message ?? "The invitation code could not be verified.");
    }

    accessToken = data.session.access_token;
    expiresIn = data.session.expires_in;
  }

  if (!accessToken && payload.tokenHash) {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: payload.tokenHash,
      type: "invite"
    });

    if (error || !data.session) {
      inviteError(error?.message ?? "The invitation token could not be verified.");
    }

    accessToken = data.session.access_token;
    expiresIn = data.session.expires_in;
  }

  if (!accessToken) {
    inviteError("The invitation link is incomplete or has expired.");
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);

  if (userError || !userData.user?.email) {
    inviteError(userError?.message ?? "The invited user could not be verified.");
  }

  const now = new Date().toISOString();
  const invitedRestaurantId = String(userData.user.user_metadata.restaurant_id ?? "");
  let membershipUpdate = admin
    .from("restaurant_users")
    .update({
      user_id: userData.user.id,
      accepted_at: now
    })
    .eq("email", userData.user.email.toLowerCase())
    .in("role", ["restaurant_admin", "owner", "manager", "staff"]);

  if (invitedRestaurantId) {
    membershipUpdate = membershipUpdate.eq("restaurant_id", invitedRestaurantId);
  }

  const { error: membershipError } = await membershipUpdate;

  if (membershipError) {
    inviteError(membershipError.message);
  }

  const invitedRole = String(userData.user.user_metadata.role ?? "restaurant_admin");
  await admin.from("profiles").upsert({
    id: userData.user.id,
    email: userData.user.email.toLowerCase(),
    role: invitedRole === "staff" ? "staff" : "restaurant_admin",
    updated_at: now
  });

  (await cookies()).set(superAdminCookieName, accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(60, expiresIn)
  });

  redirect("/auth/setup-password");
}

export async function setRestaurantOwnerPasswordAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const user = await getAuthenticatedUser();
  const admin = getSupabaseAdmin();

  if (!user || !admin) {
    redirect("/admin-login?error=Your%20invitation%20session%20has%20expired.");
  }

  if (password.length < 8) {
    redirect("/auth/setup-password?error=Password%20must%20be%20at%20least%208%20characters.");
  }

  if (password !== confirmPassword) {
    redirect("/auth/setup-password?error=Passwords%20do%20not%20match.");
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, { password });

  if (error) {
    redirect(`/auth/setup-password?error=${encodeURIComponent(error.message)}`);
  }

  await admin
    .from("restaurant_users")
    .update({ accepted_at: new Date().toISOString() })
    .eq("user_id", user.id);

  redirect("/admin?welcome=1");
}
