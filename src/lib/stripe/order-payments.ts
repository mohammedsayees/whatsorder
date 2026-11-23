import "server-only";

import type Stripe from "stripe";
import { canAcceptOnlinePayments, supportsOnlinePayments } from "@/lib/stripe/connect";
import { getRestaurantStripeAccount } from "@/lib/stripe/connect-data";
import {
  getDirectRestaurantId,
  getStripe,
  isBillingWebhookConfigured,
  isOrderPaymentWebhookConfigured
} from "@/lib/stripe/server";
import { isPushAuthorizationConfigured } from "@/lib/push-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  checkoutSessionOutcome,
  meetsOnlinePaymentMinimum,
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

/**
 * Where this restaurant's online payments are charged, when it can take them
 * right now. `stripeAccount` is the connected account (Stripe-Account header),
 * or undefined in single-café mode, where the platform account IS the café's.
 */
export type OnlinePaymentAccount = { stripeAccount: string | undefined };

// Single-café mode: is the platform account activated (charges enabled)?
// Cached briefly so checkout pages don't call Stripe on every view; any
// error (e.g. a key without Account read access) reads as "not ready".
let directReady: { value: boolean; at: number } | null = null;
const DIRECT_READY_TTL_MS = 5 * 60 * 1000;

async function isDirectAccountReady(): Promise<boolean> {
  if (directReady && Date.now() - directReady.at < DIRECT_READY_TTL_MS) {
    return directReady.value;
  }
  const stripe = getStripe();
  let value = false;
  try {
    const account = stripe ? await stripe.accounts.retrieveCurrent() : null;
    value = Boolean(account?.charges_enabled);
    if (account && !value) {
      // Logged once per cache refresh so "Pay online not showing" is diagnosable.
      console.warn("WhatsOrder Stripe: account cannot take charges yet", {
        disabledReason: account.requirements?.disabled_reason ?? null,
        currentlyDue: account.requirements?.currently_due?.slice(0, 10) ?? []
      });
    }
  } catch (error) {
    value = false;
    console.warn("WhatsOrder Stripe: could not read account status", {
      message: error instanceof Error ? error.message : "unknown"
    });
  }
  directReady = { value, at: Date.now() };
  return value;
}

/** Test hook: forget the cached activation state. */
export function resetDirectAccountReadyCache() {
  directReady = null;
}

export async function getOnlinePaymentAccount(
  restaurant: Pick<OnlinePaymentRestaurant, "id" | "country_code">
): Promise<OnlinePaymentAccount | null> {
  if (!supportsOnlinePayments(restaurant.country_code) || !getStripe() || !isPushAuthorizationConfigured()) {
    return null;
  }

  const directRestaurantId = getDirectRestaurantId();
  if (directRestaurantId) {
    // Single-café mode: only that restaurant, and its payment events arrive on
    // the platform ("Your account") webhook.
    return restaurant.id === directRestaurantId && isBillingWebhookConfigured() && (await isDirectAccountReady())
      ? { stripeAccount: undefined }
      : null;
  }

  if (!isOrderPaymentWebhookConfigured()) {
    return null;
  }
  const account = await getRestaurantStripeAccount(restaurant.id);
  return account && canAcceptOnlinePayments(account) ? { stripeAccount: account.stripe_account_id } : null;
}

/** Account to read an existing session from (no readiness checks). */
async function stripeAccountForReads(restaurantId: string): Promise<OnlinePaymentAccount | null> {
  if (getDirectRestaurantId()) {
    return restaurantId === getDirectRestaurantId() ? { stripeAccount: undefined } : null;
  }
  const account = await getRestaurantStripeAccount(restaurantId);
  return account ? { stripeAccount: account.stripe_account_id } : null;
}

function requestOptions(account: OnlinePaymentAccount) {
  return account.stripeAccount ? { stripeAccount: account.stripeAccount } : {};
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

  if (order.stripe_checkout_session_id) {
    const existing = await stripe.checkout.sessions.retrieve(
      order.stripe_checkout_session_id,
      {},
      requestOptions(account)
    );
    if (existing.status === "open" && existing.url) {
      return existing.url;
    }
    if (existing.status === "complete") {
      await applyCheckoutSessionToOrder(restaurant.id, existing);
      return null;
    }
  }

  const currency = (restaurant.currency_code ?? "AED").toLowerCase();
  // Below Stripe's minimum (AED 2.00) the session can never be created.
  if (!meetsOnlinePaymentMinimum(order.total, currency)) return null;
  const amount = toMinorUnits(order.total);

  // The idempotency key must always travel with identical parameters, or
  // Stripe rejects the retry outright. expires_at is the only time-dependent
  // one, so both come from the same one-minute window: a double tap within
  // the window gets the same session back, and a retry after a failed
  // attempt (a later window) is a fresh request instead of a stuck replay.
  const windowMinute = Math.floor(Date.now() / 60_000);
  const expiresAt = (windowMinute + 1) * 60 + SESSION_MINUTES * 60;

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
            currency,
            unit_amount: amount,
            product_data: { name: `${restaurant.name} · Order ${reference}`.slice(0, 120) }
          }
        }
      ],
      client_reference_id: orderId,
      metadata,
      payment_intent_data: { metadata, description: `WhatsOrder order ${reference}` },
      expires_at: expiresAt,
      success_url: `${confirmation}&payment=done`,
      cancel_url: `${confirmation}&payment=cancelled`
    },
    {
      ...requestOptions(account),
      // One session per order (and per replaced session after expiry).
      idempotencyKey: `whatsorder-order-${orderId}-${order.stripe_checkout_session_id ?? "first"}-${windowMinute}`
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
  const account = await stripeAccountForReads(restaurant.id);
  if (!stripe || !account) return order.online_payment_status;

  try {
    const session = await stripe.checkout.sessions.retrieve(
      order.stripe_checkout_session_id,
      {},
      requestOptions(account)
    );
    return (await applyCheckoutSessionToOrder(restaurant.id, session)) ?? order.online_payment_status;
  } catch {
    return order.online_payment_status;
  }
}
