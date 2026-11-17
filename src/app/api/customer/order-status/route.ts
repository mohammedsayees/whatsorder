// app/api/customer/order-status/route.ts
//
// Live status for the customer's order page. Authorization is the same signed,
// httpOnly per-order cookie the thank-you page requires (set when the order
// was saved): an order reference alone never reveals anything. The response
// carries status and timestamps only, never items, totals or contact details.

import { NextRequest, NextResponse } from "next/server";
import { loadOrderConfirmation } from "@/lib/order-confirmation";
import { toOrderProgressSnapshot } from "@/lib/order-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateResponseHeaders = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest): Promise<NextResponse> {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId") ?? "";
  const orderId = req.nextUrl.searchParams.get("orderId") ?? "";

  if (!restaurantId || !orderId) {
    return NextResponse.json(
      { error: "restaurantId and orderId required" },
      { status: 400, headers: privateResponseHeaders }
    );
  }

  try {
    const order = await loadOrderConfirmation(restaurantId, orderId);

    if (!order) {
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers: privateResponseHeaders }
      );
    }

    return NextResponse.json(toOrderProgressSnapshot(order), {
      status: 200,
      headers: privateResponseHeaders
    });
  } catch {
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: privateResponseHeaders }
    );
  }
}
