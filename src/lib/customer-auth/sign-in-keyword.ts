// lib/customer-auth/sign-in-keyword.ts
//
// "Sign in with WhatsApp" for cafés on the WhatsApp Web connector: the
// account page opens a chat pre-filled with SIGN_IN_KEYWORD, and a message
// that is exactly one of these keywords gets a one-time sign-in link back.
// Matching is on the WHOLE message (like the STOP opt-out), so ordinary chat
// such as "my account says…" never triggers it. Pure, so it is unit-testable.

/** Pre-filled by the account page's "Sign in with WhatsApp" button. */
export const SIGN_IN_KEYWORD = "Login";

const KEYWORDS = [
  "login",
  "log in",
  "log-in",
  "signin",
  "sign in",
  "sign-in",
  "my account",
  "account",
  "تسجيل الدخول",
  "تسجيل دخول",
  "دخول",
  "حسابي"
] as const;

function normalize(value: string): string {
  return (
    value
      .normalize("NFKC")
      // Arabic diacritics (harakat) and tatweel never change the word.
      .replace(/[ً-ٰٟـ]/g, "")
      // Zero-width / bidi marks phones insert around RTL text.
      .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "")
      .replace(/[!?.,،؟'"«»“”]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  );
}

const KEYWORD_SET = new Set<string>(KEYWORDS.map(normalize));

export function isCustomerSignInKeyword(text: string | null | undefined): boolean {
  return Boolean(text) && KEYWORD_SET.has(normalize(text as string));
}

export function signInReplyMessage(restaurantName: string, url: string): string {
  const name = restaurantName.trim() || "us";
  return (
    `Here's your sign-in link for ${name} (works once, for 10 minutes):\n${url}\n\n` +
    `رابط تسجيل الدخول الخاص بك (يعمل مرة واحدة لمدة 10 دقائق).`
  );
}

/**
 * Which WhatsApp number the account page's "Sign in with WhatsApp" opens, or
 * null when this café has no number that answers with a sign-in link:
 * an active WhatsApp Web connector (answers SIGN_IN_KEYWORD), otherwise the
 * shared Cloud number if this café owns it (it answers every message).
 */
export function customerSignInNumber(input: {
  integration: { provider: string; status: string; phone_number: string | null } | null;
  ownsCloudNumber: boolean;
  whatsappNumber: string | null | undefined;
}): string | null {
  const { integration } = input;
  if (
    integration?.provider === "whatsapp_web" &&
    integration.status === "active" &&
    integration.phone_number
  ) {
    return integration.phone_number;
  }
  if (input.ownsCloudNumber && input.whatsappNumber) {
    return input.whatsappNumber;
  }
  return null;
}
