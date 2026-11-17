// POST /api/rider/location { token, latitude, longitude, accuracy }
// Called by the rider's tracking page while it is open. The token is the
// secret from the rider's WhatsApp link (stored only as a hash); positions
// are saved only for the order's current assignment while it is active.

import { NextRequest, NextResponse } from "next/server";
import { parseRiderFix } from "@/lib/rider-location";
import { recordRiderLocation } from "@/lib/rider-location-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;

  try {
    const text = await req.text();

    if (text.length > 1024) {
      return NextResponse.json({ error: "invalid" }, { status: 400, headers });
    }

    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const fix = parseRiderFix(body);

  if (!fix) {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers });
  }

  try {
    const state = await recordRiderLocation(token, fix);

    if (state === "not_found") {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers });
    }

    return NextResponse.json({ state }, { headers });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers });
  }
}
