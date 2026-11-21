// lib/owner-whatsapp-login/config.ts
//
// Feature flag + constants for owner WhatsApp login. Everything stays off
// until OWNER_WHATSAPP_LOGIN is set AND WhatsApp + the Supabase hook secret
// are configured, so merging the code changes nothing on its own.

export type OwnerWhatsAppLoginMode = "off" | "step1" | "step2";

export const OWNER_LOGIN_LINK_TTL_SECONDS = 10 * 60;
/** How long after the request the hook may still claim it for sending. */
export const OWNER_LOGIN_CLAIM_MAX_AGE_SECONDS = 2 * 60;
export const OWNER_LOGIN_LINKS_PER_MEMBER = { max: 5, windowSeconds: 60 * 60 };
export const OWNER_LOGIN_SENDS_PER_PHONE = { max: 10, windowSeconds: 24 * 60 * 60 };

export const OWNER_LOGIN_LINK_TEMPLATE =
  process.env.WHATSAPP_OWNER_LOGIN_LINK_TEMPLATE || "owner_login_link";
export const OWNER_LOGIN_TEMPLATE_LANGUAGE =
  process.env.WHATSAPP_OWNER_LOGIN_TEMPLATE_LANGUAGE || "en";

/** Roles the super-admin may send a one-tap login link to (step 1). */
export const OWNER_LOGIN_LINK_ROLES = ["restaurant_admin", "owner", "manager"] as const;

export function ownerWhatsAppLoginMode(
  env: Record<string, string | undefined> = process.env
): OwnerWhatsAppLoginMode {
  const value = (env.OWNER_WHATSAPP_LOGIN ?? "").trim().toLowerCase();
  return value === "step1" || value === "step2" ? value : "off";
}

export function isOwnerWhatsAppLinkEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return (
    ownerWhatsAppLoginMode(env) !== "off" &&
    Boolean(env.WHATSAPP_ACCESS_TOKEN) &&
    Boolean(env.WHATSAPP_PHONE_NUMBER_ID) &&
    Boolean(env.SUPABASE_SEND_SMS_HOOK_SECRET)
  );
}

export function canReceiveOwnerLoginLink(role: string): boolean {
  return (OWNER_LOGIN_LINK_ROLES as readonly string[]).includes(role);
}

// ── Step 2: owner types their phone and gets a code ─────────────────────────

export const OWNER_LOGIN_CODE_TTL_SECONDS = 10 * 60;
/** Per phone: at most 3 codes in 15 minutes (and the 10/day phone cap above). */
export const OWNER_LOGIN_CODES_PER_PHONE = { max: 3, windowSeconds: 15 * 60 };
export const OWNER_LOGIN_CODES_PER_IP = { max: 10, windowSeconds: 60 * 60 };
export const OWNER_LOGIN_CODE_MAX_ATTEMPTS = 5;
export const OWNER_LOGIN_RESEND_COOLDOWN_SECONDS = 60;
/** Every code request takes at least this long, known number or not. */
export const OWNER_LOGIN_REQUEST_MIN_MS = 1500;
/** Refresh-cookie life for sessions started with WhatsApp. */
export const OWNER_WHATSAPP_SESSION_DAYS = 90;

export const OWNER_LOGIN_CODE_TEMPLATE =
  process.env.WHATSAPP_OWNER_LOGIN_CODE_TEMPLATE || "owner_login_code";

export function isOwnerWhatsAppCodeEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return ownerWhatsAppLoginMode(env) === "step2" && isOwnerWhatsAppLinkEnabled(env);
}
