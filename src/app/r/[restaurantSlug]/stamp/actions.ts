"use server";

// Claims the stamp of a counter order from its receipt QR. The order comes
// from the signed claim token (this café only); the phone comes ONLY from
// the customer's verified WhatsApp session — never from the browser.

import { revalidatePath } from "next/cache";
import { resolveCustomerSession } from "@/lib/customer-auth/session";
import { verifyStampClaimToken } from "@/lib/customer-auth/stamp-claim";
import { claimOrderStampForPhone } from "@/lib/customer-auth/stamp-claim-server";
import { getRestaurantBySlug } from "@/lib/data";
import type { StampClaimResult } from "@/lib/stamp-claim-text";

export type { StampClaimError, StampClaimResult } from "@/lib/stamp-claim-text";

export async function claimStampAction(restaurantSlug: string, token: string): Promise<StampClaimResult> {
  const restaurant = await getRestaurantBySlug(String(restaurantSlug ?? ""));
  const claim = await verifyStampClaimToken(String(token ?? ""));
  if (!restaurant || !claim || claim.restaurantId !== restaurant.id) {
    return { ok: false, error: "invalid_link" };
  }

  const session = await resolveCustomerSession(restaurant.id);
  if (session.status !== "signed_in") {
    return { ok: false, error: "signed_out" };
  }

  const result = await claimOrderStampForPhone({
    restaurantId: restaurant.id,
    orderId: claim.orderId,
    phone: session.identity.phone
  });
  if (result.ok) {
    revalidatePath(`/r/${restaurant.slug}/account`);
  }
  return result;
}
