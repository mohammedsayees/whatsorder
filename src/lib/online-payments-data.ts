import "server-only";

import type { OnlinePaymentOrderRow } from "@/lib/online-payments-report";
import { getRestaurantStripeAccount } from "@/lib/stripe/connect-data";
import { getDirectRestaurantId } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Reads for the Reports → "Online payments" tab. Always scoped by the
// session's restaurant id; read-only.

const MAX_ROWS = 5000;

const COLUMNS = "id,customer_name,fulfilment_type,total,status,online_payment_status,online_paid_at,created_at";

/** "Pay online" orders placed in [startIso, endExclusiveIso). */
export async function getOnlinePaymentOrders(
  restaurantId: string,
  startIso: string,
  endExclusiveIso: string
): Promise<OnlinePaymentOrderRow[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];

  const { data, error } = await admin
    .from("orders")
    .select(COLUMNS)
    .eq("restaurant_id", restaurantId)
    .not("online_payment_status", "is", null)
    .gte("created_at", startIso)
    .lt("created_at", endExclusiveIso)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS + 1);

  if (error) {
    throw new Error("Online payments could not be loaded. Please try again.");
  }
  if ((data?.length ?? 0) > MAX_ROWS) {
    throw new Error("This period has too many online payments to show at once. Choose a shorter range.");
  }
  return (data ?? []) as OnlinePaymentOrderRow[];
}

/**
 * Whether to offer the tab: the café takes (or has taken) online payments —
 * it is the single-café Stripe account, has a connected Stripe account, or
 * has any "Pay online" order on record.
 */
export async function restaurantHasOnlinePayments(restaurantId: string): Promise<boolean> {
  if (getDirectRestaurantId() === restaurantId) return true;
  if (await getRestaurantStripeAccount(restaurantId)) return true;

  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .not("online_payment_status", "is", null)
    .limit(1);
  return !error && (data?.length ?? 0) > 0;
}
