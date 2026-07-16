import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { revalidatePublicRestaurantCache } from "@/lib/public-cache";

// Instant demo stores: purge expired demo tenants (PRD Phase 1, P0 #6).
// Every child table references restaurants with ON DELETE CASCADE, so one
// delete removes the menu, orders, and customers a demo accumulated. Guarded
// by CRON_SECRET like the other crons; fails closed if the secret is unset.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return false;
  }
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { data: expired, error } = await supabase
    .from("restaurants")
    .delete()
    .eq("is_demo", true)
    .lt("demo_expires_at", new Date().toISOString())
    .select("id, slug");

  if (error) {
    console.error("WhatsOrder demo cleanup failed", { message: error.message });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  for (const restaurant of expired ?? []) {
    revalidatePublicRestaurantCache(restaurant);
  }

  return NextResponse.json({ ok: true, purged: (expired ?? []).length });
}

export async function GET(request: Request) {
  return handle(request);
}

// Vercel cron uses GET; POST is accepted for manual operator triggers.
export async function POST(request: Request) {
  return handle(request);
}
