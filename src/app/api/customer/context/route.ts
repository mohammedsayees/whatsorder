// app/api/customer/context/route.ts
//
// Returns the signed-in customer's prefill payload for a café in one shot:
//   { signedIn, profile, loyalty, recentOrders }
// Backed by get_customer_context (service_role-only, bypasses RLS) via the
// shared server-side loader, so this MUST run server-side.
//
// The PWA's server components read the same payload directly via
// loadCustomerContext(); this route exists for any client-side caller that
// needs to re-check after load (e.g. a future OTP cold-open flow).

import { NextRequest, NextResponse } from "next/server";
import { loadCustomerContext } from "@/lib/customer-auth/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  const ctx = await loadCustomerContext(restaurantId);

  if (!ctx.signedIn) {
    return NextResponse.json({ signedIn: false }, { status: 200 });
  }

  if (ctx.error) {
    const status = ctx.error === "service_unavailable" ? 503 : 502;
    return NextResponse.json({ signedIn: true, error: ctx.error }, { status });
  }

  return NextResponse.json(
    {
      signedIn: true,
      phone: ctx.phone,
      profile: ctx.profile,
      loyalty: ctx.loyalty,
      recentOrders: ctx.recentOrders
    },
    { status: 200 }
  );
}
