"use server";

// Server actions for the customer account page. Every action re-resolves the
// signed session for the café named by the slug, then reads or writes ONLY
// the row keyed by (restaurant_id, phone) from that session. Nothing the
// browser sends can widen that scope.

import { revalidatePath } from "next/cache";
import { getRestaurantBySlug } from "@/lib/data";
import { clearCustomerSession } from "@/lib/customer-auth/cookies";
import { resolveCustomerSession } from "@/lib/customer-auth/session";
import { loadCustomerAccount } from "@/lib/customer-account-data";
import { cleanCustomerName, type CustomerAccountPage } from "@/lib/customer-account";
import { marketingConsentWithdrawalFields } from "@/lib/marketing/opt-out";
import { getSupabaseAdmin } from "@/lib/supabase";

export type AccountActionResult = { ok: true } | { ok: false; error: AccountActionError };
export type AccountActionError = "signed_out" | "invalid" | "failed";

async function signedInCustomer(restaurantSlug: string) {
  const restaurant = await getRestaurantBySlug(String(restaurantSlug ?? ""));
  if (!restaurant) {
    return null;
  }
  const session = await resolveCustomerSession(restaurant.id);
  if (session.status !== "signed_in") {
    return null;
  }
  return { restaurant, phone: session.identity.phone };
}

export async function loadMoreAccountOrdersAction(
  restaurantSlug: string,
  before: string
): Promise<({ ok: true } & CustomerAccountPage) | { ok: false; error: AccountActionError }> {
  const beforeDate = new Date(String(before ?? ""));
  if (Number.isNaN(beforeDate.getTime())) {
    return { ok: false, error: "invalid" };
  }
  const restaurant = await getRestaurantBySlug(String(restaurantSlug ?? ""));
  if (!restaurant) {
    return { ok: false, error: "signed_out" };
  }
  const result = await loadCustomerAccount(restaurant.id, beforeDate.toISOString());
  if (result.status === "signed_out") {
    return { ok: false, error: "signed_out" };
  }
  if (result.status === "error") {
    return { ok: false, error: "failed" };
  }
  return { ok: true, orders: result.account.orders, hasMore: result.account.hasMore };
}

export async function updateCustomerNameAction(
  restaurantSlug: string,
  name: string
): Promise<AccountActionResult> {
  const cleanName = cleanCustomerName(name);
  if (!cleanName) {
    return { ok: false, error: "invalid" };
  }
  const customer = await signedInCustomer(restaurantSlug);
  if (!customer) {
    return { ok: false, error: "signed_out" };
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: "failed" };
  }
  const { data, error } = await admin
    .from("customers")
    .update({ name: cleanName, updated_at: new Date().toISOString() })
    .eq("restaurant_id", customer.restaurant.id)
    .eq("phone", customer.phone)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("WhatsOrder customer name update failed", error.code);
    return { ok: false, error: "failed" };
  }
  revalidatePath(`/r/${customer.restaurant.slug}/account`);
  return { ok: true };
}

export async function setMarketingConsentAction(
  restaurantSlug: string,
  consent: boolean
): Promise<AccountActionResult> {
  if (typeof consent !== "boolean") {
    return { ok: false, error: "invalid" };
  }
  const customer = await signedInCustomer(restaurantSlug);
  if (!customer) {
    return { ok: false, error: "signed_out" };
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return { ok: false, error: "failed" };
  }
  const now = new Date().toISOString();
  // Consent is per café (PDPL): this changes the row for THIS restaurant only.
  const fields = consent
    ? {
        consent_marketing: true,
        marketing_opt_in: true,
        marketing_consent_source: "customer_account",
        marketing_consent_updated_at: now,
        marketing_consent_withdrawn_at: null
      }
    : marketingConsentWithdrawalFields("customer_account");
  const { data, error } = await admin
    .from("customers")
    .update(fields)
    .eq("restaurant_id", customer.restaurant.id)
    .eq("phone", customer.phone)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("WhatsOrder customer consent update failed", error.code);
    return { ok: false, error: "failed" };
  }
  revalidatePath(`/r/${customer.restaurant.slug}/account`);
  return { ok: true };
}

export async function signOutCustomerAction(restaurantSlug: string): Promise<AccountActionResult> {
  const restaurant = await getRestaurantBySlug(String(restaurantSlug ?? ""));
  if (!restaurant) {
    return { ok: false, error: "invalid" };
  }
  await clearCustomerSession(restaurant.id);
  return { ok: true };
}
