// lib/customer-account-data.ts
//
// Server-side loader for the customer account page. The identity (café +
// phone) comes ONLY from the signed session cookie — never from the request —
// so a customer can read nothing but their own history at this café.

import "server-only";

import { resolveCustomerSession } from "@/lib/customer-auth/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ACCOUNT_ORDERS_PAGE_SIZE,
  parseCustomerAccountPayload,
  type CustomerAccount
} from "@/lib/customer-account";

export type CustomerAccountResult =
  | { status: "signed_out" }
  | { status: "error" }
  | { status: "ok"; account: CustomerAccount };

export async function loadCustomerAccount(
  restaurantId: string,
  before: string | null = null
): Promise<CustomerAccountResult> {
  const session = await resolveCustomerSession(restaurantId);
  if (session.status === "signed_out") {
    return { status: "signed_out" };
  }
  const supabase = getSupabaseAdmin();
  if (session.status === "unavailable" || !supabase) {
    return { status: "error" };
  }

  const { data, error } = await supabase.rpc("get_customer_account", {
    p_restaurant_id: session.identity.restaurantId,
    p_phone: session.identity.phone,
    p_before: before,
    p_limit: ACCOUNT_ORDERS_PAGE_SIZE
  });
  if (error) {
    console.error("WhatsOrder customer account lookup failed", error.code);
    return { status: "error" };
  }

  return {
    status: "ok",
    account: parseCustomerAccountPayload(session.identity.phone, data)
  };
}
