import "server-only";

import Stripe from "stripe";

// Platform Stripe client (WhatsOrder's own account). Server only: the secret
// key never reaches the browser. Returns null when Stripe isn't configured,
// so every Stripe feature stays hidden instead of failing.

let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    return null;
  }

  if (!cached) {
    cached = new Stripe(key, {
      appInfo: { name: "WhatsOrder" },
      maxNetworkRetries: 2,
      // fetch works on Vercel and honours the sandbox proxy in development.
      httpClient: Stripe.createFetchHttpClient()
    });
  }

  return cached;
}

/**
 * Browser-safe key for Stripe's embedded components (admin pages only). Read
 * on the server and passed down as a prop, so either name works without a
 * rebuild-time NEXT_PUBLIC_ variable.
 */
export function getStripePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.STRIPE_PUBLISHABLE_KEY || null;
}

/**
 * Money can only be taken when the matching signed webhook is configured:
 * without it a successful payment would never be recorded.
 */
export function isOrderPaymentWebhookConfigured() {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export function isBillingWebhookConfigured() {
  return Boolean(process.env.STRIPE_BILLING_WEBHOOK_SECRET);
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY && getStripePublishableKey());
}

export function isStripeLiveMode() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") || process.env.STRIPE_SECRET_KEY?.startsWith("rk_live_"));
}
