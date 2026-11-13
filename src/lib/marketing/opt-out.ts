// lib/marketing/opt-out.ts
//
// Pure helpers for marketing opt-out: the inbound STOP keyword matcher, the
// consent-withdrawal field set shared by staff and customer opt-outs, and the
// confirmation reply. No I/O here so every rule is unit-testable.

/**
 * Keywords that withdraw marketing consent when a customer sends them as the
 * WHOLE message. Matching is exact after trimming and case-folding — a
 * sentence that merely contains "stop" ("stop the onions please") must never
 * opt someone out.
 */
export const MARKETING_OPT_OUT_KEYWORDS = [
  "stop",
  "unsubscribe",
  "إيقاف",
  "ايقاف",
  "إلغاء",
  "الغاء"
] as const;

const KEYWORD_SET = new Set<string>(
  MARKETING_OPT_OUT_KEYWORDS.map((keyword) => normalizeKeyword(keyword))
);

function normalizeKeyword(value: string): string {
  return (
    value
      .normalize("NFKC")
      // Arabic diacritics (harakat) and tatweel never change the word.
      .replace(/[ً-ٰٟـ]/g, "")
      // Zero-width / bidi marks phones insert around RTL text.
      .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "")
      .trim()
      .toLowerCase()
  );
}

export function isMarketingOptOutKeyword(text: string | null | undefined): boolean {
  if (!text) {
    return false;
  }
  return KEYWORD_SET.has(normalizeKeyword(text));
}

export type MarketingConsentSource =
  | "restaurant_recorded_stop"
  | "customer_replied_stop";

/** The customers-row update that withdraws marketing consent. */
export function marketingConsentWithdrawalFields(
  source: MarketingConsentSource,
  now: Date = new Date()
) {
  const iso = now.toISOString();
  return {
    consent_marketing: false,
    marketing_opt_in: false,
    marketing_consent_source: source,
    marketing_consent_updated_at: iso,
    marketing_consent_withdrawn_at: iso
  };
}

export function optOutConfirmationMessage(restaurantName: string): string {
  const name = restaurantName.trim() || "us";
  return `You're unsubscribed from offers from ${name}. You'll still get updates about your orders.`;
}
