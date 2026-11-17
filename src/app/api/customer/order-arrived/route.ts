// app/api/customer/order-arrived/route.ts
//
// Car pickup "I'm here". The customer's order page posts here when they tap
// "I've arrived". Authorization is the same signed, httpOnly per-order cookie
// as the order page itself: an order reference alone cannot mark an order.
// Writes only two arrival columns, with the service role, scoped to the
// restaurant and order, and only while a car-pickup order is still active.

import { NextRequest, NextResponse } from "next/server";
import { canMarkArrived, normalizeArrivalNote } from "@/lib/car-arrival";
import { getOrderPushAuthorization } from "@/lib/push-auth";
import { isClientOrderId } from "@/lib/staff-order-payload";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { FulfilmentType, OrderStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;

  try {
    const text = await req.text();

    if (text.length > 1024) {
      return reply({ error: "invalid" }, 400);
    }

    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return reply({ error: "invalid" }, 400);
  }

  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  const orderId = typeof body.orderId === "string" ? body.orderId : "";

  if (!UUID.test(restaurantId) || !isClientOrderId(orderId)) {
    return reply({ error: "invalid" }, 400);
  }

  const authorization = await getOrderPushAuthorization(orderId);

  if (authorization?.restaurantId !== restaurantId || authorization.orderId !== orderId) {
    return reply({ error: "not_found" }, 404);
  }

  const admin = getSupabaseAdmin();

  if (!admin) {
    return reply({ error: "unavailable" }, 503);
  }

  const { data: order, error: readError } = await admin
    .from("orders")
    .select("fulfilment_type,status,customer_arrived_at")
    .eq("restaurant_id", restaurantId)
    .eq("id", orderId)
    .maybeSingle();

  if (readError) {
    return reply({ error: "unavailable" }, 503);
  }

  if (!order) {
    return reply({ error: "not_found" }, 404);
  }

  const current = order as {
    fulfilment_type: FulfilmentType | null;
    status: OrderStatus;
    customer_arrived_at: string | null;
  };

  if (!canMarkArrived(current)) {
    return reply({ error: "not_allowed" }, 409);
  }

  // Keep the first arrival time (it drives "waiting for N min"); a second tap
  // only updates where the customer parked.
  const arrivedAt = current.customer_arrived_at ?? new Date().toISOString();
  const note = normalizeArrivalNote(body.note);
  const { error: writeError } = await admin
    .from("orders")
    .update({ customer_arrived_at: arrivedAt, customer_arrival_note: note })
    .eq("restaurant_id", restaurantId)
    .eq("id", orderId)
    .eq("fulfilment_type", "car_pickup");

  if (writeError) {
    return reply({ error: "unavailable" }, 503);
  }

  return reply({ customer_arrived_at: arrivedAt, customer_arrival_note: note }, 200);
}
