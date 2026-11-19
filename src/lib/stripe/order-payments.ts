import "server-only";

import type Stripe from "stripe";
import { canAcceptOnlinePayments, supportsOnlinePayments } from "@/lib/stripe/connect";
import { getRestaurantStripeAccount } from "@/lib/stripe/connect-data";
import { getStripe } from "@/lib/stripe/server";
import { isPushAuthorizationConfigured } from "@/lib/push-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  checkoutSessionOutcome,
  toMinorUnits,
  type OnlinePaymentStatus
} from "@/lib/stripe/order-payment-rules";

// Customer "Pay online": a Stripe Checkout Session created directly on the
// restaurant's own connected account (direct charge, the money settles to the
// restaurant's bank). Every lookup is scoped by restaurant id AND order id
// from the server, never by a client-supplied Stripe id.

type OnlinePaymentRestaurant = {
  id: string;
  name: string;
  slug: string;
  country_code?: string | null;
  currency_code?: string | null;
};

/** The restaurant's Stripe account when it can take card payments right now. */
export async function getOnlinePaymentAccount(restaurant: Pick<OnlinePaymentRestaurant, "id" | "country_code">) {
  if (!supportsOnlinePayments(restaurant.country_code) || !getStripe() || !isPushAuthorizationConfigured()) {
    return null;
  }

  const account = await getRestaurantStripeAccount(restaurant.id);
  return account && canAcceptOnlinePayments(account) ? account : null;
}

type OrderPaymentRow = {
  id: string;
  total: number;
  status: string;
  online_payment_status: OnlinePaymentStatus | null;
  stripe_checkout_session_id: string | null;
};

async function loadOrderPayment(restaurantId: string, orderId: string): Promise<OrderPaymentRow | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from("orders")
    .select("id,total,status,online_payment_status,stripe_checkout_session_id")
    .eq("restaurant_id", restaurantId)
    .eq("id", orderId)
    .maybeSingle();
  return error ? null : ((data as OrderPaymentRow | null) ?? null);
}

/**
 * Records a Checkout Session outcome on the order it belongs to. Matches on
 * restaurant + session id, so an old (replaced) session can never touch the
 * order, and a paid order is never moved back to pending/expired.
 */
export async function applyCheckoutSessionToOrder(
  restaurantId: string,
  session: Pick<Stripe.Checkout.Session, "id" | "status" | "payment_status" | "payment_intent">,
  override?: OnlinePaymentStatus
): Promise<OnlinePaymentStatus | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;

  const outcome = override ?? checkoutSessionOutcome(session);
  if (!outcome) return null;

  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  if (outcome === "paid") {
    const { data } = await admin
      .from("orders")
      .update({
        online_payment_status: "paid",
        payment_method: "Online Payment",
        online_paid_at: new Date().toISOString(),
        ...(paymentIntentId ? { stripe_payment_intent_id: paymentIntentId } : {})
      })
      .eq("restaurant_id", restaurantId)
      .eq("stripe_checkout_session_id", session.id)
      .in("online_payment_status", ["pending", "expired", "failed"])
      .select("id");
    return data && data.length > 0 ? "paid" : null;
  }

  const { data } = await admin
    .from("orders")
    .update({ online_payment_status: outcome })
    .eq("restaurant_id", restaurantId)
    .eq("stripe_checkout_session_id", session.id)
    .eq("online_payment_status", "pending")
    .select("id");
  return data && data.length > 0 ? outcome : null;
}

/** Marks a paid-online order refunded (Stripe charge.refunded, full refund). */
export async function markOrderRefunded(restaurantId: string, paymentIntentId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  await admin
    .from("orders")
    .update({ online_payment_status: "refunded" })
    .eq("restaurant_id", restaurantId)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("online_payment_status", "paid");
}

const SESSION_MINUTES = 35; // Stripe allows 30 minutes to 24 hours.

/**
 * Returns a URL where the customer can pay this order: the open Checkout
 * Session if there is one, otherwise a new one. Null when the order can't be
 * paid online (already paid, closed, or the restaurant can't take payments).
 */
export async function checkoutUrlForOrder(input: {
  restaurant: OnlinePaymentRestaurant;
  orderId: string;
  origin: string;
}): Promise<string | null> {
  const { restaurant, orderId, origin } = input;
  const stripe = getStripe();
  const admin = getSupabaseAdmin();
  const account = await getOnlinePaymentAccount(restaurant);
  const order = await loadOrderPayment(restaurant.id, orderId);

  if (!stripe || !admin || !account || !order) return null;
  if (order.status === "Cancelled" || order.status === "Completed") return null;
  if (order.online_payment_status === "paid" || order.online_payment_status === "refunded") return null;
  // Only orders placed with "Pay online" (status set at checkout) can be paid
  // here; cash/card-on-collection orders never switch to online payment.
  if (order.online_payment_status === null) return null;

  const stripeAccount = account.stripe_account_id;

  if (order.stripe_checkout_session_id) {
    const existing = await stripe.checkout.sessions.retrieve(order.stripe_checkout_session_id, {}, { stripeAccount });
    if (existing.status === "open" && existing.url) {
      return existing.url;
    }
    if (existing.status === "complete") {
      await applyCheckoutSessionToOrder(restaurant.id, existing);
      return null;
    }
  }

  const amount = toMinorUnits(order.total);
  if (amount <= 0) return null;

  const reference = orderId.slice(-8).toUpperCase();
  const confirmation = `${origin}/r/${restaurant.slug}/thank-you?order=${encodeURIComponent(orderId)}`;
  const metadata = { whatsorder_order_id: orderId, whatsorder_restaurant_id: restaurant.id };
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: (restaurant.currency_code ?? "AED").toLowerCase(),
            unit_amount: amount,
            product_data: { name: `${restaurant.name} · Order ${reference}`.slice(0, 120) }
          }
        }
      ],
      client_reference_id: orderId,
      metadata,
      payment_intent_data: { metadata, description: `WhatsOrder order ${reference}` },
      expires_at: Math.floor(Date.now() / 1000) + SESSION_MINUTES * 60,
      success_url: `${confirmation}&payment=done`,
      cancel_url: `${confirmation}&payment=cancelled`
    },
    {
      stripeAccount,
      // One session per order (and per replaced session after expiry).
      idempotencyKey: `whatsorder-order-${orderId}-${order.stripe_checkout_session_id ?? "first"}`
    }
  );

  const { error } = await admin
    .from("orders")
    .update({ stripe_checkout_session_id: session.id, online_payment_status: "pending" })
    .eq("restaurant_id", restaurant.id)
    .eq("id", orderId)
    .not("online_payment_status", "in", "(paid,refunded)");

  return error ? null : session.url;
}

/**
 * Re-reads the order's Checkout Session from Stripe while it is pending, so
 * the customer sees "Paid" on return even if the webhook is still on its way.
 */
export async function refreshOrderPayment(
  restaurant: Pick<OnlinePaymentRestaurant, "id" | "country_code">,
  orderId: string
): Promise<OnlinePaymentStatus | null> {
  const order = await loadOrderPayment(restaurant.id, orderId);
  if (!order?.online_payment_status || order.online_payment_status !== "pending" || !order.stripe_checkout_session_id) {
    return order?.online_payment_status ?? null;
  }

  const stripe = getStripe();
  const account = await getRestaurantStripeAccount(restaurant.id);
  if (!stripe || !account) return order.online_payment_status;

  try {
    const session = await stripe.checkout.sessions.retrieve(
      order.stripe_checkout_session_id,
      {},
      { stripeAccount: account.stripe_account_id }
    );
    return (await applyCheckoutSessionToOrder(restaurant.id, session)) ?? order.online_payment_status;
  } catch {
    return order.online_payment_status;
  }
}
