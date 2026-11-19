// app/api/stripe/webhook/route.ts
//
// Stripe Connect webhook (events from restaurants' connected accounts).
// Every request is verified with the endpoint signing secret before anything
// is read. The connected account on the event decides the restaurant; orders
// are then matched by that restaurant AND the Checkout Session id, so one
// restaurant's events can never touch another restaurant's orders.

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { handleStripeEvent } from "@/lib/stripe/webhook-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = req.headers.get("stripe-signature");

  if (!stripe || !secret) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    const result = await handleStripeEvent(event);
    return NextResponse.json({ received: true, result });
  } catch (error) {
    console.error("WhatsOrder Stripe webhook failed", {
      type: event.type,
      message: error instanceof Error ? error.message : "unknown"
    });
    // 500 makes Stripe retry later.
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
