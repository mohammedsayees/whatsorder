import "server-only";

import type Stripe from "stripe";
import { isStripeLiveMode } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { applyCheckoutSessionToOrder, markOrderRefunded } from "@/lib/stripe/order-payments";

// Connected-account events -> orders. The account on the event decides the
// restaurant; orders are then matched by that restaurant AND the Checkout
// Session (or PaymentIntent) id.

async function restaurantForAccount(accountId: string, livemode: boolean): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from("restaurant_stripe_accounts")
    .select("restaurant_id")
    .eq("stripe_account_id", accountId)
    .eq("livemode", livemode)
    .maybeSingle();
  return (data as { restaurant_id?: string } | null)?.restaurant_id ?? null;
}

export async function handleStripeEvent(event: Stripe.Event): Promise<"handled" | "ignored"> {
  if (!event.account) return "ignored";
  // Never let test events touch live data (or the reverse).
  if (event.livemode !== isStripeLiveMode()) return "ignored";

  const restaurantId = await restaurantForAccount(event.account, event.livemode);
  if (!restaurantId) return "ignored";

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object;
      if (session.metadata?.whatsorder_restaurant_id && session.metadata.whatsorder_restaurant_id !== restaurantId) {
        return "ignored";
      }
      await applyCheckoutSessionToOrder(restaurantId, session);
      return "handled";
    }
    case "checkout.session.async_payment_failed":
      await applyCheckoutSessionToOrder(restaurantId, event.data.object, "failed");
      return "handled";
    case "checkout.session.expired":
      await applyCheckoutSessionToOrder(restaurantId, event.data.object, "expired");
      return "handled";
    case "charge.refunded": {
      const charge = event.data.object;
      const paymentIntentId =
        typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      // Full refunds only; a partial refund keeps the order "Paid online".
      if (paymentIntentId && charge.refunded) {
        await markOrderRefunded(restaurantId, paymentIntentId);
      }
      return "handled";
    }
    default:
      return "ignored";
  }
}
