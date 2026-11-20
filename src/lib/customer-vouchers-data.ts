// lib/customer-vouchers-data.ts
//
// Server-side read of the vouchers a signed-in customer can use. The identity
// comes from the verified customer session, never from the request.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import { parseCustomerVouchers, type CustomerVoucher } from "@/lib/customer-vouchers";

/** Never throws: an unavailable lookup reads as "no vouchers". */
export async function loadCustomerVouchers(identity: {
  restaurantId: string;
  phone: string;
}): Promise<CustomerVoucher[]> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return [];
  }
  const { data, error } = await admin.rpc("get_customer_vouchers", {
    p_restaurant_id: identity.restaurantId,
    p_phone: identity.phone
  });
  if (error) {
    console.error("WhatsOrder customer vouchers lookup failed", error.code);
    return [];
  }
  return parseCustomerVouchers(data);
}
