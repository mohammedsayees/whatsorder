// "Pay now" for a "Pay online" order: sends the customer to the order's open
// Stripe Checkout page (or a fresh one after the last one expired).
// Authorization is the signed per-order cookie set when the order was saved;
// an order id in the URL alone never opens a payment page.

import { NextRequest, NextResponse } from "next/server";
import { getRestaurantBySlug } from "@/lib/data";
import { getOrderPushAuthorization } from "@/lib/push-auth";
import { isClientOrderId } from "@/lib/staff-order-payload";
import { checkoutUrlForOrder } from "@/lib/stripe/order-payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ restaurantSlug: string }> }
): Promise<NextResponse> {
  const { restaurantSlug } = await params;
  const orderId = req.nextUrl.searchParams.get("order") ?? "";
  const restaurant = await getRestaurantBySlug(restaurantSlug);
  const authorization = isClientOrderId(orderId) ? await getOrderPushAuthorization(orderId) : null;

  if (!restaurant || authorization?.restaurantId !== restaurant.id || authorization.orderId !== orderId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const orderPage = new URL(`/r/${restaurant.slug}/thank-you`, req.nextUrl.origin);
  orderPage.searchParams.set("order", orderId);

  let paymentUrl: string | null = null;
  try {
    paymentUrl = await checkoutUrlForOrder({ restaurant, orderId, origin: req.nextUrl.origin });
  } catch (error) {
    console.error("WhatsOrder Pay now failed", {
      restaurantId: restaurant.id,
      message: error instanceof Error ? error.message : "unknown"
    });
  }

  if (!paymentUrl) {
    orderPage.searchParams.set("payment", "unavailable");
    return NextResponse.redirect(orderPage, 303);
  }

  return NextResponse.redirect(paymentUrl, 303);
}
