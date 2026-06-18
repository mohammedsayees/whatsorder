"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import {
  getAuthenticatedUser,
  refreshTokenCookieName,
  superAdminCookieName
} from "@/lib/super-admin-auth";
import { hasValidInvitationMetadata } from "@/lib/security";

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
  let refreshToken = payload.refreshToken ?? "";
  let expiresIn = 3600;

  if (!accessToken && payload.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(payload.code);

    if (error || !data.session) {
      inviteError(error?.message ?? "The invitation code could not be verified.");
    }

    accessToken = data.session.access_token;
    refreshToken = data.session.refresh_token;
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
    refreshToken = data.session.refresh_token;
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
  const invitedRole = String(userData.user.user_metadata.role ?? "");

  if (!hasValidInvitationMetadata(invitedRestaurantId, invitedRole)) {
    inviteError("This invitation is missing its restaurant assignment. Request a new invitation.");
  }

  const { data: membership, error: membershipLookupError } = await admin
    .from("restaurant_users")
    .select("id,user_id,role")
    .eq("restaurant_id", invitedRestaurantId)
    .eq("email", userData.user.email.toLowerCase())
    .eq("role", invitedRole)
    .maybeSingle();

  if (
    membershipLookupError ||
    !membership ||
    (membership.user_id && membership.user_id !== userData.user.id)
  ) {
    inviteError("This invitation no longer matches an active restaurant assignment.");
  }

  const { error: membershipError } = await admin
    .from("restaurant_users")
    .update({
      user_id: userData.user.id,
      accepted_at: now
    })
    .eq("id", membership.id)
    .eq("restaurant_id", invitedRestaurantId);

  if (membershipError) {
    inviteError(membershipError.message);
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: userData.user.id,
    email: userData.user.email.toLowerCase(),
    role: invitedRole === "staff" ? "staff" : "restaurant_admin",
    updated_at: now
  });

  if (profileError) {
    inviteError(profileError.message);
  }

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  } as const;
  cookieStore.set(superAdminCookieName, accessToken, {
    ...cookieOptions,
    maxAge: Math.max(60, expiresIn)
  });
  if (refreshToken) {
    cookieStore.set(refreshTokenCookieName, refreshToken, {
      ...cookieOptions,
      maxAge: 60 * 60 * 24 * 30
    });
  }

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

  const { error: membershipError } = await admin
    .from("restaurant_users")
    .update({ accepted_at: new Date().toISOString() })
    .eq("user_id", user.id);
  if (membershipError) {
    redirect(`/auth/setup-password?error=${encodeURIComponent(membershipError.message)}`);
  }

  redirect("/admin?welcome=1");
}
