// app/api/stripe/billing-webhook/route.ts
//
// Stripe webhook for WhatsOrder's OWN account (cafés paying WhatsOrder
// invoices by card). Separate from /api/stripe/webhook, which receives
// connected-account events for customer orders. Verified with
// STRIPE_BILLING_WEBHOOK_SECRET before anything is read.

import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isStripeLiveMode } from "@/lib/stripe/server";
import { applyAutopayPaymentIntent, applyBillingCheckoutSession } from "@/lib/stripe/billing";
import { handleDirectOrderEvent } from "@/lib/stripe/webhook-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(event: Stripe.Event) {
  // Connected-account events and the other mode's events are not ours.
  if (event.account || event.livemode !== isStripeLiveMode()) return "ignored";
  let result: "handled" | "ignored" = "ignored";
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      result = await applyBillingCheckoutSession(event.data.object);
      break;
    case "payment_intent.succeeded":
      result = await applyAutopayPaymentIntent(event.data.object);
      break;
  }
  // Single-café mode: that café's customer order payments also arrive here.
  return result === "handled" ? result : handleDirectOrderEvent(event);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
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
    return NextResponse.json({ received: true, result: await handle(event) });
  } catch (error) {
    console.error("WhatsOrder billing webhook failed", {
      type: event.type,
      message: error instanceof Error ? error.message : "unknown"
    });
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
