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
