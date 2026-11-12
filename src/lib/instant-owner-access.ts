import "server-only";

import { ownerEmailVerificationDueAt } from "@/lib/owner-email-verification";
import { getPublicAppUrl } from "@/lib/super-admin-data";
import { createEphemeralAuthClient, getSupabaseAdmin } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type InstantOwnerSession =
  | {
      ok: true;
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }
  | { ok: false; reason: string };

// Signs a brand-new owner straight into their dashboard right after a demo
// claim, without an email round trip.
//
// Safety rules:
// - Callers must only use this after claim_demo_restaurant succeeded with the
//   private claim proof (so only the device that built the demo gets here).
// - It ONLY works for an email with no existing Auth account: the invite link
//   is generated with type "invite", which Supabase refuses for registered
//   emails. Existing accounts (possibly someone else's) fall back to the
//   normal emailed invite, so nobody can be signed in to an account by typing
//   its email.
// - The email is not yet proven, so the restaurant gets a verification due
//   date (see owner-email-verification.ts) and a confirmation email is sent.
// - Session creation runs on an ephemeral client, never the shared one.
export async function startInstantOwnerSession(
  admin: AdminClient,
  restaurantId: string,
  email: string
): Promise<InstantOwnerSession> {
  const authClient = createEphemeralAuthClient();
  if (!authClient) {
    return { ok: false, reason: "auth_not_configured" };
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { restaurant_id: restaurantId, role: "restaurant_admin" } }
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !link?.user || !tokenHash) {
    // Most commonly: the email already has an account.
    return { ok: false, reason: linkError?.message ?? "link_not_generated" };
  }

  const { data: verified, error: verifyError } = await authClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: "invite"
  });
  const session = verified?.session;
  if (
    verifyError ||
    !session ||
    session.user.id !== link.user.id ||
    session.user.email?.toLowerCase() !== email.toLowerCase()
  ) {
    return { ok: false, reason: verifyError?.message ?? "session_not_created" };
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const { data: membership, error: membershipError } = await admin
    .from("restaurant_users")
    .update({ user_id: session.user.id, invited_at: nowIso, accepted_at: nowIso })
    .eq("restaurant_id", restaurantId)
    .eq("email", email.toLowerCase())
    .eq("role", "restaurant_admin")
    .is("user_id", null)
    .select("id")
    .maybeSingle();
  if (membershipError || !membership) {
    return { ok: false, reason: membershipError?.message ?? "membership_not_found" };
  }

  const { error: profileError } = await admin.from("profiles").upsert({
    id: session.user.id,
    email: email.toLowerCase(),
    role: "restaurant_admin",
    updated_at: nowIso
  });
  if (profileError) {
    return { ok: false, reason: profileError.message };
  }

  const { error: restaurantError } = await admin
    .from("restaurants")
    .update({
      owner_email_verified_at: null,
      owner_email_verification_due_at: ownerEmailVerificationDueAt(now).toISOString()
    })
    .eq("id", restaurantId)
    .eq("is_demo", false);
  if (restaurantError) {
    return { ok: false, reason: restaurantError.message };
  }

  return {
    ok: true,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in
  };
}

// Emails the owner a one-click confirmation link (Supabase "magic link"
// template) that lands on /auth/verify-email. Best-effort: Supabase rate
// limits these per address, and a failure is shown, never thrown.
export async function sendOwnerVerificationEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const authClient = createEphemeralAuthClient();
  if (!authClient) {
    return { ok: false, error: "Email is not configured." };
  }

  const { error } = await authClient.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${getPublicAppUrl()}/auth/verify-email`
    }
  });

  if (error) {
    console.error("WhatsOrder owner verification email failed", { message: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
