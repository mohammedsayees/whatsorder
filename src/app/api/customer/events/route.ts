// app/api/customer/events/route.ts
//
// Receives anonymous ordering-funnel beacons from the public pages and stores
// them with the service role (browsers never write the table directly).
// Always answers 204 so a beacon can never break or slow the customer's page.
// Abuse limits: strict payload validation, a body-size cap, a best-effort
// per-IP rate limit, and the database's one-step-per-visit constraint.

import { NextRequest, NextResponse } from "next/server";
import { parseFunnelPayload } from "@/lib/customer-funnel";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1024;
const WINDOW_MS = 60_000;
const MAX_EVENTS_PER_WINDOW = 60;

// Per-instance only; the unique constraint is the real bound.
const recentByIp = new Map<string, { count: number; resetAt: number }>();

function allowRequest(ip: string, now: number) {
  const entry = recentByIp.get(ip);

  if (!entry || entry.resetAt <= now) {
    if (recentByIp.size > 5000) {
      recentByIp.clear();
    }
    recentByIp.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  entry.count += 1;
  return entry.count <= MAX_EVENTS_PER_WINDOW;
}

const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  if (!allowRequest(ip, Date.now())) {
    return noContent();
  }

  let payload;

  try {
    const text = await req.text();

    if (text.length > MAX_BODY_BYTES) {
      return noContent();
    }

    payload = parseFunnelPayload(JSON.parse(text));
  } catch {
    return noContent();
  }

  const admin = getSupabaseAdmin();

  if (!payload || !admin) {
    return noContent();
  }

  try {
    // Unknown restaurant ids fail the foreign key and are dropped silently.
    await admin.from("customer_funnel_events").upsert(
      {
        restaurant_id: payload.restaurantId,
        session_id: payload.sessionId,
        event_name: payload.event,
        order_key: payload.orderId ?? "",
        detail: payload.detail ?? null,
        fulfilment_type: payload.fulfilmentType ?? null
      },
      {
        onConflict: "restaurant_id,session_id,event_name,order_key",
        ignoreDuplicates: true
      }
    );
  } catch {
    // Analytics is best-effort.
  }

  return noContent();
}
