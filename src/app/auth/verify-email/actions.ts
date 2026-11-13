"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { accessTokenCookieName, refreshTokenCookieName } from "@/lib/auth-cookies";
import { sendOwnerVerificationEmail } from "@/lib/instant-owner-access";
import {
  createPasswordSetupToken,
  hashPasswordSetupToken,
  passwordSetupCookieName,
  passwordSetupLifetimeMs
} from "@/lib/password-setup";
import { createEphemeralAuthClient, getSupabaseAdmin } from "@/lib/supabase";
import { getRestaurantAdminSession } from "@/lib/super-admin-auth";

type VerifyPayload = {
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  tokenHash?: string;
  type?: string;
};

function verifyError(message: string): never {
  redirect(`/auth/verify-email?error=${encodeURIComponent(message)}`);
}

// Landing for the owner confirmation email. Opening the link proves the
// owner controls the address: mark it verified on every restaurant they own
// under that email, sign this device in, and offer a password.
export async function completeOwnerEmailVerificationAction(payload: VerifyPayload) {
  const admin = getSupabaseAdmin();
  const authClient = createEphemeralAuthClient();
  if (!admin || !authClient) {
    verifyError("Sign-in is not configured.");
  }

  let accessToken = payload.accessToken ?? "";
  let refreshToken = payload.refreshToken ?? "";
  let expiresIn = 3600;

  if (!accessToken && payload.code) {
    const { data, error } = await authClient.auth.exchangeCodeForSession(payload.code);
    if (error || !data.session) {
      verifyError("This confirmation link has expired. Send a new one from your dashboard.");
    }
    accessToken = data.session.access_token;
    refreshToken = data.session.refresh_token;
    expiresIn = data.session.expires_in;
  }

  if (!accessToken && payload.tokenHash) {
    const otpType = payload.type === "email" ? "email" : "magiclink";
    const { data, error } = await authClient.auth.verifyOtp({
      token_hash: payload.tokenHash,
      type: otpType
    });
    if (error || !data.session) {
      verifyError("This confirmation link has expired. Send a new one from your dashboard.");
    }
    accessToken = data.session.access_token;
    refreshToken = data.session.refresh_token;
    expiresIn = data.session.expires_in;
  }

  if (!accessToken) {
    verifyError("This confirmation link is incomplete or has expired.");
  }

  // auth.getUser(jwt) validates the token server-side without storing it.
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  const user = userData?.user;
  if (userError || !user?.email) {
    verifyError("We couldn't confirm this link. Send a new one from your dashboard.");
  }
  const email = user.email.toLowerCase();

  const { data: memberships } = await admin
    .from("restaurant_users")
    .select("id, restaurant_id")
    .eq("user_id", user.id)
    .in("role", ["owner", "restaurant_admin"])
    .not("accepted_at", "is", null);
  const membershipList = memberships ?? [];
  const restaurantIds = membershipList.map((membership) => String(membership.restaurant_id));

  const now = new Date().toISOString();
  if (restaurantIds.length > 0) {
    await admin
      .from("restaurants")
      .update({ owner_email_verified_at: now, owner_email_verification_due_at: null })
      .in("id", restaurantIds)
      .eq("owner_email", email)
      .is("owner_email_verified_at", null);
  }

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  } as const;
  cookieStore.set(accessTokenCookieName, accessToken, { ...cookieOptions, maxAge: Math.max(60, expiresIn) });
  if (refreshToken) {
    cookieStore.set(refreshTokenCookieName, refreshToken, { ...cookieOptions, maxAge: 60 * 60 * 24 * 30 });
  }

  // Offer a password so the owner can sign in on other devices. Reuses the
  // invite flow's one-time setup proof.
  const firstMembership = membershipList[0];
  if (firstMembership) {
    const setupToken = createPasswordSetupToken();
    const { error: setupError } = await admin
      .from("restaurant_users")
      .update({
        password_setup_token_hash: hashPasswordSetupToken(setupToken),
        password_setup_expires_at: new Date(Date.now() + passwordSetupLifetimeMs).toISOString()
      })
      .eq("id", firstMembership.id)
      .eq("user_id", user.id);
    if (!setupError) {
      cookieStore.set(passwordSetupCookieName, setupToken, {
        ...cookieOptions,
        sameSite: "strict",
        maxAge: Math.floor(passwordSetupLifetimeMs / 1000)
      });
      redirect("/auth/setup-password?verified=1");
    }
  }

  redirect("/admin?verified=1");
}

export type ResendVerificationState = { status: "idle" | "sent" | "error"; message: string };

// Dashboard "resend" button. Only the signed-in owner/admin of a restaurant
// whose owner email is still unconfirmed can trigger it, and only for that
// restaurant's own owner email.
export async function resendOwnerVerificationEmailAction(
  _previous: ResendVerificationState
): Promise<ResendVerificationState> {
  const session = await getRestaurantAdminSession();
  const ownerEmail = session?.owner.owner_email?.toLowerCase();
  if (
    !session ||
    !ownerEmail ||
    (session.role !== "owner" && session.role !== "restaurant_admin") ||
    session.owner.owner_email_verified_at
  ) {
    return { status: "error", message: "There's nothing to confirm for this account." };
  }

  const result = await sendOwnerVerificationEmail(ownerEmail);
  return result.ok
    ? { status: "sent", message: `Sent. Check ${ownerEmail} (and the spam folder).` }
    : {
        status: "error",
        message: "We couldn't send it just now. Wait a minute and try again."
      };
}
