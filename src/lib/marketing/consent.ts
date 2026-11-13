// lib/marketing/consent.ts
//
// Service-role marketing-consent withdrawal, keyed by the customer's
// digits-only phone WITHIN ONE restaurant. Consent is per-tenant (PDPL):
// a STOP sent to one café never touches the same phone at another.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

import {
  marketingConsentWithdrawalFields,
  type MarketingConsentSource
} from "./opt-out";

export async function withdrawMarketingConsentByPhone(
  restaurantId: string,
  phone: string,
  source: MarketingConsentSource
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin || !restaurantId || !phone) {
    return false;
  }
  const { error } = await admin
    .from("customers")
    .update(marketingConsentWithdrawalFields(source))
    .eq("restaurant_id", restaurantId)
    .eq("phone", phone);
  if (error) {
    console.error("WhatsOrder marketing: consent withdrawal failed", {
      code: error.code,
      restaurantId
    });
    return false;
  }
  return true;
}
