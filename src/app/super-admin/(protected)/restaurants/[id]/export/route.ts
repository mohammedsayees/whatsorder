import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requireSuperAdmin } from "@/lib/super-admin-auth";

// Super Admin only: download everything stored for one restaurant as JSON
// (every restaurant-owned table), e.g. to hand a café its data before a
// permanent deletion. Route handlers don't run page layouts, so the auth
// check lives here.
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const admin = getSupabaseAdmin();
  const { id } = await params;

  if (!admin || !uuidPattern.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await admin.rpc("export_restaurant_data", { target_restaurant_id: id });
  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const slug = String((data as { restaurant?: { slug?: string } }).restaurant?.slug ?? id).replace(
    /[^a-z0-9-]/gi,
    ""
  );
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="whatsorder-${slug}-${date}.json"`,
      "cache-control": "no-store"
    }
  });
}
