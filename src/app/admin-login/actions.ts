"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createEphemeralAuthClient } from "@/lib/supabase";
import {
  getSuperAdminSession,
  refreshTokenCookieName,
  resolveRestaurantAdminSession,
  superAdminCookieName
} from "@/lib/super-admin-auth";
import {
  activeRestaurantCookieName,
  longSessionCookieName,
  ownerLoginPhoneCookieName
} from "@/lib/auth-cookies";
import { OWNER_LOGIN_REQUEST_MIN_MS } from "@/lib/owner-whatsapp-login/config";
import {
  decodeOwnerLoginPhoneCookie,
  encodeOwnerLoginPhoneCookie
} from "@/lib/owner-whatsapp-login/pending-phone";
import { requestOwnerLoginCode, verifyOwnerLoginCode } from "@/lib/owner-whatsapp-login/server";
import { setOwnerWhatsAppSessionCookies } from "@/lib/owner-whatsapp-login/session-cookies";
import { revokeCurrentAuthSession } from "@/lib/auth-session-revocation";

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
  cookieStore.delete(longSessionCookieName);
  cookieStore.delete(activeRestaurantCookieName);
}

export async function loginRestaurantAdminAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const supabase = createEphemeralAuthClient();

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

  // Belonging to several restaurants is not an error — keep the session and let
  // the user pick which restaurant to work on.
  if (resolution.issue === "restaurant_selection_required") {
    redirect("/select-restaurant");
  }

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
  await revokeCurrentAuthSession();
  await clearAuthCookies();
  redirect("/admin-login");
}

// ── WhatsApp code login (owner WhatsApp login, step 2) ──────────────────────
// The phone the code screen waits on lives in a short-lived httpOnly cookie,
// never in the URL. Every code request takes the same minimum time and gives
// the same answer whether or not the number is registered.

const OWNER_LOGIN_PHONE_COOKIE_MAX_AGE = 15 * 60;

async function clientIp(): Promise<string> {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headerStore.get("x-real-ip") || "unknown";
}

async function atLeast<T>(minMs: number, work: Promise<T>): Promise<T> {
  const [result] = await Promise.all([work, new Promise((resolve) => setTimeout(resolve, minMs))]);
  return result;
}

function loginRedirect(params: Record<string, string>): never {
  redirect(`/admin-login?${new URLSearchParams(params).toString()}`);
}

async function startCodeRequest(phoneInput: string) {
  const result = await atLeast(
    OWNER_LOGIN_REQUEST_MIN_MS,
    requestOwnerLoginCode({ phoneInput, ip: await clientIp() })
  );
  if (result.status === "invalid_phone") {
    loginRedirect({ wa_error: "invalid_phone" });
  }
  if (result.status === "rate_limited") {
    loginRedirect({ wa_error: "rate_limited" });
  }
  if (result.status === "not_configured") {
    loginRedirect({ wa_error: "unavailable" });
  }
  const cookieStore = await cookies();
  cookieStore.set(ownerLoginPhoneCookieName, encodeOwnerLoginPhoneCookie(result.phoneE164, Date.now()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin-login",
    maxAge: OWNER_LOGIN_PHONE_COOKIE_MAX_AGE
  });
  redirect("/admin-login");
}

export async function requestOwnerWhatsAppCodeAction(formData: FormData) {
  await startCodeRequest(String(formData.get("phone") ?? ""));
}

export async function resendOwnerWhatsAppCodeAction() {
  const pending = decodeOwnerLoginPhoneCookie((await cookies()).get(ownerLoginPhoneCookieName)?.value);
  if (!pending) {
    redirect("/admin-login");
  }
  await startCodeRequest(pending.phoneE164);
}

export async function changeOwnerWhatsAppNumberAction() {
  (await cookies()).delete({ name: ownerLoginPhoneCookieName, path: "/admin-login" });
  redirect("/admin-login");
}

export async function verifyOwnerWhatsAppCodeAction(formData: FormData) {
  const cookieStore = await cookies();
  const pending = decodeOwnerLoginPhoneCookie(cookieStore.get(ownerLoginPhoneCookieName)?.value);
  if (!pending) {
    redirect("/admin-login");
  }
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const result = await verifyOwnerLoginCode(pending.phoneE164, code);
  if (!result.ok) {
    loginRedirect({ wa_error: result.reason === "not_configured" ? "unavailable" : result.reason });
  }

  cookieStore.delete({ name: ownerLoginPhoneCookieName, path: "/admin-login" });
  await setOwnerWhatsAppSessionCookies(result);

  const resolution = await resolveRestaurantAdminSession();
  if (resolution.issue === "restaurant_selection_required") {
    redirect("/select-restaurant");
  }
  if (!resolution.session) {
    await clearAuthCookies();
    redirect(
      `/admin-login?error=${encodeURIComponent("This number is not linked to an active restaurant. Contact WhatsOrder support.")}`
    );
  }
  redirect("/admin?signed_in=whatsapp");
}
