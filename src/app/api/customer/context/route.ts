// app/api/customer/context/route.ts
//
// Returns the signed-in customer's prefill payload for a café in one shot:
//   { signedIn, profile, loyalty, recentOrders }
// Backed by the get_customer_context(restaurant_id, phone) Postgres function,
// which is service_role-only (it bypasses RLS), so this MUST run server-side.
//
// The PWA calls this right after load:
//   GET /api/customer/context?restaurantId=<uuid>
// and uses the result to prefill name + address, show stamps, and render the
// reorder strip — before the menu finishes rendering.

import { NextRequest, NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/customer-auth/cookies";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const restaurantId = req.nextUrl.searchParams.get("restaurantId");
  if (!restaurantId) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }

  // Are they signed in AT THIS café? (Per-café cookie; null = cold open.)
  const identity = await getCustomerSession(restaurantId);
  if (!identity) {
    return NextResponse.json({ signedIn: false }, { status: 200 });
  }

  // Reuse the repo's single service-role client (src/lib/supabase.ts); it
  // bypasses RLS, which get_customer_context requires.
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { signedIn: true, error: "service_unavailable" },
      { status: 503 },
    );
  }

  const { data, error } = await supabase.rpc("get_customer_context", {
    p_restaurant_id: identity.restaurantId,
    p_phone: identity.phone,
  });

  if (error) {
    return NextResponse.json(
      { signedIn: true, error: "context_lookup_failed" },
      { status: 502 },
    );
  }

  // `data` is the jsonb the function returns: { profile, loyalty, recent_orders }.
  // A brand-new phone (no profile yet) returns profile: null — the PWA should
  // render the "first order" empty state in that case.
  return NextResponse.json(
    {
      signedIn: true,
      phone: identity.phone,
      profile: data?.profile ?? null,
      loyalty: data?.loyalty ?? null,
      recentOrders: data?.recent_orders ?? [],
    },
    { status: 200 },
  );
}
