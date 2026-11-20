// Opens one of the signed-in customer's own orders on the existing
// confirmation / tracking page.
//
// The confirmation page only shows an order to a browser holding that
// order's signed access cookie (normally set at checkout). A customer looking
// at their history may be on another device, or the order may have come in
// through WhatsApp chat or staff entry. So: verify the customer session, check
// the order belongs to THIS café AND this customer's phone, then issue the
// same order cookie and redirect. Anything else goes back to the account page.

import { NextRequest, NextResponse } from "next/server";
import { resolveCustomerSession } from "@/lib/customer-auth/session";
import { getRestaurantBySlug } from "@/lib/data";
import { setOrderPushAuthorization } from "@/lib/push-auth";
import { isClientOrderId } from "@/lib/staff-order-payload";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantSlug: string; orderId: string }> }
): Promise<NextResponse> {
  const { restaurantSlug, orderId } = await params;
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  if (!restaurant) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
  const accountUrl = new URL(`/r/${restaurant.slug}/account`, req.nextUrl.origin);

  if (!isClientOrderId(orderId)) {
    return NextResponse.redirect(accountUrl);
  }
  const session = await resolveCustomerSession(restaurant.id);
  const admin = getSupabaseAdmin();
  if (session.status !== "signed_in" || !admin) {
    return NextResponse.redirect(accountUrl);
  }

  const { data, error } = await admin
    .from("orders")
    .select("id")
    .eq("restaurant_id", restaurant.id)
    .eq("id", orderId)
    .eq("customer_phone", session.identity.phone)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.redirect(accountUrl);
  }

  const authorized = await setOrderPushAuthorization({
    orderId,
    restaurantId: restaurant.id
  });
  if (!authorized) {
    return NextResponse.redirect(accountUrl);
  }

  const target = new URL(`/r/${restaurant.slug}/thank-you`, req.nextUrl.origin);
  target.searchParams.set("order", orderId);
  if (req.nextUrl.searchParams.get("lang") === "ar") {
    target.searchParams.set("lang", "ar");
  }
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
