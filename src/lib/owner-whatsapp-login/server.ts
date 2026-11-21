// lib/owner-whatsapp-login/server.ts
//
// Server side of owner WhatsApp login, step 1 (super-admin sends a one-tap
// login link). All database writes use the service role; nothing here is
// reachable from the customer path.
//
// Flow:
//   1. requestOwnerLoginLink: checks the member, reserves a rate-limited
//      owner_login_requests row, asks Supabase to start a phone OTP.
//   2. Supabase calls the Send SMS hook with the code -> handleSendSmsHook
//      claims that request (only requests WhatsOrder made can be claimed) and
//      sends the login-link template on WhatsApp.
//   3. The owner taps the link -> redeemOwnerLoginLink consumes the request
//      once and verifies the code with Supabase, which creates the session.

import "server-only";

import { createHash } from "node:crypto";
import { getSupabaseAdmin, createEphemeralAuthClient } from "@/lib/supabase";
import { isRestaurantAdminAccessAllowed } from "@/lib/security";
import { sendWhatsAppTemplate } from "@/lib/customer-auth/whatsapp-cloud";
import type { RestaurantStatus } from "@/lib/types";
import {
  OWNER_LOGIN_CLAIM_MAX_AGE_SECONDS,
  OWNER_LOGIN_CODE_MAX_ATTEMPTS,
  OWNER_LOGIN_CODE_TEMPLATE,
  OWNER_LOGIN_CODE_TTL_SECONDS,
  OWNER_LOGIN_CODES_PER_IP,
  OWNER_LOGIN_CODES_PER_PHONE,
  OWNER_LOGIN_RESEND_COOLDOWN_SECONDS,
  OWNER_LOGIN_LINK_TEMPLATE,
  OWNER_LOGIN_LINK_TTL_SECONDS,
  OWNER_LOGIN_LINKS_PER_MEMBER,
  OWNER_LOGIN_SENDS_PER_PHONE,
  OWNER_LOGIN_TEMPLATE_LANGUAGE,
  canReceiveOwnerLoginLink,
  isOwnerWhatsAppCodeEnabled,
  isOwnerWhatsAppLinkEnabled
} from "@/lib/owner-whatsapp-login/config";
import { buildOwnerLoginLinkSuffix } from "@/lib/owner-whatsapp-login/link-token";
import {
  fromSupabasePhone,
  isE164,
  toE164,
  toSupabasePhone
} from "@/lib/owner-whatsapp-login/phone";

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type OwnerAuthEvent =
  | "link_sent"
  | "link_send_failed"
  | "code_sent"
  | "login_succeeded"
  | "login_failed"
  | "phone_added"
  | "phone_verified"
  | "phone_changed"
  | "phone_removed"
  | "signed_out_everywhere";

export async function recordOwnerAuthEvent(
  admin: AdminClient,
  event: {
    restaurantId: string;
    restaurantUserId: string | null;
    actorUserId: string | null;
    event: OwnerAuthEvent;
    channel?: "whatsapp" | "super_admin";
    wamid?: string | null;
    detail?: string | null;
  }
): Promise<void> {
  const { error } = await admin.from("owner_auth_events").insert({
    restaurant_id: event.restaurantId,
    restaurant_user_id: event.restaurantUserId,
    actor_user_id: event.actorUserId,
    event: event.event,
    channel: event.channel ?? "whatsapp",
    wamid: event.wamid ?? null,
    detail: event.detail ? event.detail.slice(0, 300) : null
  });
  if (error) {
    // Audit failures are logged, never fatal to the login itself.
    console.error("WhatsOrder owner auth event not recorded", event.event, error.code);
  }
}

type MembershipRow = {
  id: string;
  restaurant_id: string;
  user_id: string | null;
  email: string | null;
  role: string;
  phone_e164: string | null;
  phone_verified_at: string | null;
};

const MEMBERSHIP_COLUMNS = "id,restaurant_id,user_id,email,role,phone_e164,phone_verified_at";

async function loadMembership(
  admin: AdminClient,
  restaurantId: string,
  membershipId: string
): Promise<MembershipRow | null> {
  const { data, error } = await admin
    .from("restaurant_users")
    .select(MEMBERSHIP_COLUMNS)
    .eq("id", membershipId)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return data as MembershipRow;
}

// ── Phone verification (super-admin confirmed on a call) ────────────────────

export type LinkAuthUserResult = { ok: true; userId: string } | { ok: false; error: string };

/**
 * Make sure the member's Supabase user owns this phone, so a phone OTP signs
 * into the same account as their email (if any). Never merges accounts: if
 * the phone already belongs to a different user, this refuses.
 */
export async function linkAuthUserToPhone(
  admin: AdminClient,
  membership: Pick<MembershipRow, "id" | "user_id">,
  phoneE164: string
): Promise<LinkAuthUserResult> {
  const phone = toSupabasePhone(phoneE164);

  if (membership.user_id) {
    const { data: existing } = await admin.auth.admin.getUserById(membership.user_id);
    if (existing?.user && fromSupabasePhone(existing.user.phone) === phoneE164) {
      return { ok: true, userId: membership.user_id };
    }
    const { error } = await admin.auth.admin.updateUserById(membership.user_id, {
      phone,
      phone_confirm: true
    });
    if (error) {
      return {
        ok: false,
        error: "This phone is already linked to another WhatsOrder login. Contact engineering before reusing it."
      };
    }
    return { ok: true, userId: membership.user_id };
  }

  // Same person on several restaurants: reuse the login that already has
  // this verified phone instead of creating a second one.
  const { data: sibling } = await admin
    .from("restaurant_users")
    .select("user_id")
    .eq("phone_e164", phoneE164)
    .not("phone_verified_at", "is", null)
    .not("user_id", "is", null)
    .neq("id", membership.id)
    .limit(1)
    .maybeSingle();
  if (sibling?.user_id) {
    return { ok: true, userId: String(sibling.user_id) };
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    phone,
    phone_confirm: true
  });
  if (error || !created?.user) {
    return {
      ok: false,
      error: "This phone is already linked to another WhatsOrder login. Contact engineering before reusing it."
    };
  }
  return { ok: true, userId: created.user.id };
}

// ── Step 1: send a login link ───────────────────────────────────────────────

export type RequestOwnerLoginLinkResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export async function requestOwnerLoginLink(
  admin: AdminClient,
  input: { restaurantId: string; membershipId: string; requestedBy: string }
): Promise<RequestOwnerLoginLinkResult> {
  if (!isOwnerWhatsAppLinkEnabled()) {
    return { ok: false, error: "WhatsApp login links are not switched on for this deployment." };
  }

  const membership = await loadMembership(admin, input.restaurantId, input.membershipId);
  if (!membership) {
    return { ok: false, error: "Restaurant user could not be found." };
  }
  if (!canReceiveOwnerLoginLink(membership.role)) {
    return { ok: false, error: "Login links can be sent to owners and managers only." };
  }
  if (!isE164(membership.phone_e164) || !membership.phone_verified_at || !membership.user_id) {
    return { ok: false, error: "Verify this person's WhatsApp number before sending a login link." };
  }

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("status")
    .eq("id", input.restaurantId)
    .maybeSingle();
  if (!restaurant || !isRestaurantAdminAccessAllowed(restaurant.status as RestaurantStatus)) {
    return { ok: false, error: "This restaurant is paused or unavailable, so no login link was sent." };
  }

  const { data: requestId, error: reserveError } = await admin.rpc("reserve_owner_login_request", {
    target_kind: "link",
    target_phone_e164: membership.phone_e164,
    target_restaurant_user_id: membership.id,
    target_restaurant_id: input.restaurantId,
    target_requested_by: input.requestedBy,
    target_ip_hash: null,
    ttl_seconds: OWNER_LOGIN_LINK_TTL_SECONDS,
    max_per_member: OWNER_LOGIN_LINKS_PER_MEMBER.max,
    member_window_seconds: OWNER_LOGIN_LINKS_PER_MEMBER.windowSeconds,
    max_per_phone: OWNER_LOGIN_SENDS_PER_PHONE.max,
    phone_window_seconds: OWNER_LOGIN_SENDS_PER_PHONE.windowSeconds
  });
  if (reserveError) {
    console.error("WhatsOrder owner login request not reserved", reserveError.code);
    return { ok: false, error: "The login link could not be prepared. Try again shortly." };
  }
  if (!requestId) {
    return {
      ok: false,
      error: "Too many login links were sent to this number recently. Wait an hour and try again."
    };
  }

  // Supabase generates the code and calls our Send SMS hook synchronously;
  // the hook sends the WhatsApp message (or returns an error we see here).
  const authClient = createEphemeralAuthClient();
  if (!authClient) {
    return { ok: false, error: "Supabase is not configured." };
  }
  const { error: otpError } = await authClient.auth.signInWithOtp({
    phone: toSupabasePhone(membership.phone_e164),
    options: { shouldCreateUser: false, channel: "sms" }
  });
  if (otpError) {
    await recordOwnerAuthEvent(admin, {
      restaurantId: input.restaurantId,
      restaurantUserId: membership.id,
      actorUserId: input.requestedBy,
      event: "link_send_failed",
      channel: "super_admin",
      detail: otpError.message
    });
    return {
      ok: false,
      error: "WhatsApp did not accept the login link. Check the number is on WhatsApp and try again."
    };
  }

  return { ok: true, message: "Login link sent on WhatsApp. It works once, for 10 minutes." };
}

// ── Send SMS hook ───────────────────────────────────────────────────────────

export type SendSmsHookResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

/**
 * Handle Supabase's Send SMS hook (signature already verified by the route).
 * Sends ONLY for a request WhatsOrder itself reserved in the last two
 * minutes; any other OTP for a registered phone is refused, so the public OTP
 * endpoint cannot be used to make us message someone.
 */
export async function handleSendSmsHook(payload: unknown): Promise<SendSmsHookResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, status: 503, message: "Not configured" };
  }
  const body = payload as { user?: { phone?: unknown }; sms?: { otp?: unknown } } | null;
  const phoneE164 = fromSupabasePhone(typeof body?.user?.phone === "string" ? body.user.phone : null);
  const otp = typeof body?.sms?.otp === "string" ? body.sms.otp : null;
  if (!phoneE164 || !otp || !/^\d{6}$/.test(otp)) {
    return { ok: false, status: 400, message: "Unsupported hook payload" };
  }

  const { data: claimed, error: claimError } = await admin.rpc(
    "claim_owner_login_request_for_send",
    { target_phone_e164: phoneE164, max_age_seconds: OWNER_LOGIN_CLAIM_MAX_AGE_SECONDS }
  );
  const request = (Array.isArray(claimed) ? claimed[0] : claimed) as
    | { request_id: string; request_kind: string; restaurant_id: string; restaurant_user_id: string }
    | undefined;
  if (claimError || !request) {
    return { ok: false, status: 403, message: "No login was requested for this number" };
  }
  let wamid: string | null;
  if (request.request_kind === "code") {
    if (!isOwnerWhatsAppCodeEnabled()) {
      return { ok: false, status: 403, message: "Login codes are not enabled" };
    }
    // Authentication template: the code in the body and in the copy-code
    // button, as Meta requires.
    wamid = await sendWhatsAppTemplate(
      toSupabasePhone(phoneE164),
      OWNER_LOGIN_CODE_TEMPLATE,
      OWNER_LOGIN_TEMPLATE_LANGUAGE,
      [
        { type: "body", parameters: [{ type: "text", text: otp }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: otp }] }
      ]
    );
  } else {
    const { data: restaurant } = await admin
      .from("restaurants")
      .select("name")
      .eq("id", request.restaurant_id)
      .maybeSingle();
    const restaurantName = String(restaurant?.name ?? "").trim() || "your restaurant";

    wamid = await sendWhatsAppTemplate(
      toSupabasePhone(phoneE164),
      OWNER_LOGIN_LINK_TEMPLATE,
      OWNER_LOGIN_TEMPLATE_LANGUAGE,
      [
        { type: "body", parameters: [{ type: "text", text: restaurantName }] },
        {
          type: "button",
          sub_type: "url",
          index: "0",
          parameters: [{ type: "text", text: buildOwnerLoginLinkSuffix(request.request_id, otp) }]
        }
      ]
    );
  }

  await recordOwnerAuthEvent(admin, {
    restaurantId: request.restaurant_id,
    restaurantUserId: request.restaurant_user_id,
    actorUserId: null,
    event: wamid ? (request.request_kind === "code" ? "code_sent" : "link_sent") : "link_send_failed",
    wamid,
    detail: wamid || request.request_kind !== "code" ? null : "code send failed"
  });

  if (!wamid) {
    return { ok: false, status: 502, message: "WhatsApp send failed" };
  }
  return { ok: true };
}

// ── Redeem the link ─────────────────────────────────────────────────────────

export type RedeemOwnerLoginLinkResult =
  | { ok: true; accessToken: string; refreshToken: string; expiresIn: number }
  | { ok: false; reason: "used_or_expired" | "not_configured" | "verify_failed" };

export async function redeemOwnerLoginLink(
  requestId: string,
  code: string
): Promise<RedeemOwnerLoginLinkResult> {
  const admin = getSupabaseAdmin();
  const authClient = createEphemeralAuthClient();
  if (!admin || !authClient || !isOwnerWhatsAppLinkEnabled()) {
    return { ok: false, reason: "not_configured" };
  }

  const { data: consumed, error: consumeError } = await admin.rpc("consume_owner_login_link", {
    target_request_id: requestId
  });
  const request = (Array.isArray(consumed) ? consumed[0] : consumed) as
    | { phone_e164: string; restaurant_id: string; restaurant_user_id: string }
    | undefined;
  if (consumeError || !request) {
    return { ok: false, reason: "used_or_expired" };
  }

  const { data: verified, error: verifyError } = await authClient.auth.verifyOtp({
    phone: toSupabasePhone(request.phone_e164),
    token: code,
    type: "sms"
  });
  const session = verified?.session;
  if (
    verifyError ||
    !session ||
    fromSupabasePhone(session.user.phone) !== request.phone_e164
  ) {
    await recordOwnerAuthEvent(admin, {
      restaurantId: request.restaurant_id,
      restaurantUserId: request.restaurant_user_id,
      actorUserId: null,
      event: "login_failed",
      detail: verifyError?.message ?? "session_mismatch"
    });
    return { ok: false, reason: "verify_failed" };
  }

  // First login activates the membership (the session snapshot requires
  // accepted_at). Scoped to this member and this user only.
  const nowIso = new Date().toISOString();
  await admin
    .from("restaurant_users")
    .update({ accepted_at: nowIso })
    .eq("id", request.restaurant_user_id)
    .eq("restaurant_id", request.restaurant_id)
    .eq("user_id", session.user.id)
    .is("accepted_at", null);

  await recordOwnerAuthEvent(admin, {
    restaurantId: request.restaurant_id,
    restaurantUserId: request.restaurant_user_id,
    actorUserId: session.user.id,
    event: "login_succeeded"
  });

  return {
    ok: true,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in
  };
}

// ── Step 2: owner asks for a code ───────────────────────────────────────────

export function hashLoginIp(ip: string): string {
  return createHash("sha256").update(`whatsorder-owner-login:${ip}`).digest("hex");
}

export type RequestOwnerLoginCodeResult =
  // "accepted" is returned for registered AND unknown numbers alike, so the
  // page never reveals whether a number has an account.
  | { status: "accepted"; phoneE164: string }
  | { status: "invalid_phone" }
  | { status: "rate_limited" }
  | { status: "not_configured" };

export async function requestOwnerLoginCode(input: {
  phoneInput: string;
  ip: string;
}): Promise<RequestOwnerLoginCodeResult> {
  const admin = getSupabaseAdmin();
  const authClient = createEphemeralAuthClient();
  if (!admin || !authClient || !isOwnerWhatsAppCodeEnabled()) {
    return { status: "not_configured" };
  }

  const phoneE164 = toE164(input.phoneInput);
  if (!phoneE164) {
    return { status: "invalid_phone" };
  }

  // Counted for every request, known number or not.
  const { data: ipAllowed, error: ipError } = await admin.rpc("check_owner_login_ip_rate_limit", {
    target_ip_hash: hashLoginIp(input.ip),
    max_attempts: OWNER_LOGIN_CODES_PER_IP.max,
    window_seconds: OWNER_LOGIN_CODES_PER_IP.windowSeconds
  });
  if (ipError) {
    console.error("WhatsOrder owner login IP limit failed", ipError.code);
    return { status: "not_configured" };
  }
  if (!ipAllowed) {
    return { status: "rate_limited" };
  }

  const accepted = { status: "accepted", phoneE164 } as const;

  // An active member with this verified phone and a linked login. The oldest
  // membership is used, so repeated requests hit the same per-member cooldown.
  const { data: memberships } = await admin
    .from("restaurant_users")
    .select("id,restaurant_id,user_id,restaurants!inner(status)")
    .eq("phone_e164", phoneE164)
    .not("phone_verified_at", "is", null)
    .not("user_id", "is", null)
    .order("created_at");
  const membership = (memberships ?? []).find((row) => {
    const restaurant = Array.isArray(row.restaurants) ? row.restaurants[0] : row.restaurants;
    return isRestaurantAdminAccessAllowed((restaurant as { status?: RestaurantStatus } | null)?.status);
  });
  if (!membership) {
    return accepted;
  }

  // Daily cap per phone (shared with super-admin links).
  const { count: todayCount } = await admin
    .from("owner_login_requests")
    .select("id", { count: "exact", head: true })
    .eq("phone_e164", phoneE164)
    .gte("created_at", new Date(Date.now() - OWNER_LOGIN_SENDS_PER_PHONE.windowSeconds * 1000).toISOString());
  if ((todayCount ?? 0) >= OWNER_LOGIN_SENDS_PER_PHONE.max) {
    return accepted;
  }

  // Member window = resend cooldown; phone window = 3 per 15 minutes.
  const { data: requestId, error: reserveError } = await admin.rpc("reserve_owner_login_request", {
    target_kind: "code",
    target_phone_e164: phoneE164,
    target_restaurant_user_id: membership.id,
    target_restaurant_id: membership.restaurant_id,
    target_requested_by: null,
    target_ip_hash: hashLoginIp(input.ip),
    ttl_seconds: OWNER_LOGIN_CODE_TTL_SECONDS,
    max_per_member: 1,
    member_window_seconds: OWNER_LOGIN_RESEND_COOLDOWN_SECONDS,
    max_per_phone: OWNER_LOGIN_CODES_PER_PHONE.max,
    phone_window_seconds: OWNER_LOGIN_CODES_PER_PHONE.windowSeconds
  });
  if (reserveError) {
    console.error("WhatsOrder owner login code not reserved", reserveError.code);
    return accepted;
  }
  if (!requestId) {
    return accepted;
  }

  const { error: otpError } = await authClient.auth.signInWithOtp({
    phone: toSupabasePhone(phoneE164),
    options: { shouldCreateUser: false, channel: "sms" }
  });
  if (otpError) {
    console.error("WhatsOrder owner login code not sent", otpError.status ?? "unknown");
  }
  return accepted;
}

// ── Step 2: owner enters the code ───────────────────────────────────────────

export type VerifyOwnerLoginCodeResult =
  | { ok: true; accessToken: string; refreshToken: string; expiresIn: number }
  | { ok: false; reason: "wrong_code" | "expired" | "not_configured" };

export async function verifyOwnerLoginCode(
  phoneE164: string,
  code: string
): Promise<VerifyOwnerLoginCodeResult> {
  const admin = getSupabaseAdmin();
  const authClient = createEphemeralAuthClient();
  if (!admin || !authClient || !isOwnerWhatsAppCodeEnabled()) {
    return { ok: false, reason: "not_configured" };
  }
  if (!isE164(phoneE164) || !/^\d{6}$/.test(code)) {
    return { ok: false, reason: "wrong_code" };
  }

  // Count the attempt first; after the cap there is nothing left to try.
  const { data: started, error: startError } = await admin.rpc("start_owner_code_verification", {
    target_phone_e164: phoneE164,
    max_attempts: OWNER_LOGIN_CODE_MAX_ATTEMPTS
  });
  const request = (Array.isArray(started) ? started[0] : started) as
    | { request_id: string; restaurant_id: string; restaurant_user_id: string }
    | undefined;
  if (startError || !request) {
    return { ok: false, reason: "expired" };
  }

  const { data: verified, error: verifyError } = await authClient.auth.verifyOtp({
    phone: toSupabasePhone(phoneE164),
    token: code,
    type: "sms"
  });
  const session = verified?.session;
  if (verifyError || !session || fromSupabasePhone(session.user.phone) !== phoneE164) {
    await recordOwnerAuthEvent(admin, {
      restaurantId: request.restaurant_id,
      restaurantUserId: request.restaurant_user_id,
      actorUserId: null,
      event: "login_failed",
      detail: verifyError?.message ?? "session_mismatch"
    });
    return { ok: false, reason: "wrong_code" };
  }

  await admin.rpc("finish_owner_code_login", { target_request_id: request.request_id });

  // Activate every verified-phone membership of this login that is waiting.
  await admin
    .from("restaurant_users")
    .update({ accepted_at: new Date().toISOString() })
    .eq("user_id", session.user.id)
    .eq("phone_e164", phoneE164)
    .not("phone_verified_at", "is", null)
    .is("accepted_at", null);

  await recordOwnerAuthEvent(admin, {
    restaurantId: request.restaurant_id,
    restaurantUserId: request.restaurant_user_id,
    actorUserId: session.user.id,
    event: "login_succeeded"
  });

  return {
    ok: true,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in
  };
}
