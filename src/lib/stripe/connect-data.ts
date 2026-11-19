import "server-only";

import {
  cardPaymentsStatusOf,
  requirementsDueOf,
  type CardPaymentsStatus
} from "@/lib/stripe/connect";
import { getStripe, isStripeLiveMode } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Restaurant Stripe accounts (Connect, SaaS platform with direct charges):
// Stripe collects fees and owns loss liability; the restaurant uses the full
// Stripe Dashboard. Every function is scoped by the restaurant id from the
// verified admin session, never by a client-supplied account id.

export type RestaurantStripeAccount = {
  restaurant_id: string;
  stripe_account_id: string;
  livemode: boolean;
  card_payments_status: CardPaymentsStatus;
  requirements_due: boolean;
  status_checked_at: string | null;
};

export class StripeConnectError extends Error {
  constructor(readonly code: "not_configured" | "unavailable" | "not_connected") {
    super(code);
  }
}

function clients() {
  const stripe = getStripe();
  const admin = getSupabaseAdmin();

  if (!stripe) {
    throw new StripeConnectError("not_configured");
  }

  if (!admin) {
    throw new StripeConnectError("unavailable");
  }

  return { stripe, admin };
}

const SELECT = "restaurant_id,stripe_account_id,livemode,card_payments_status,requirements_due,status_checked_at";

export async function getRestaurantStripeAccount(
  restaurantId: string
): Promise<RestaurantStripeAccount | null> {
  const admin = getSupabaseAdmin();

  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from("restaurant_stripe_accounts")
    .select(SELECT)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (error) {
    // Table not migrated yet or a transient error: treat as not connected.
    return null;
  }

  const row = data as RestaurantStripeAccount | null;

  // A test-mode account must never be used with live keys (or vice versa).
  return row && row.livemode === isStripeLiveMode() ? row : null;
}

/**
 * Creates the restaurant's Stripe account once. Retries and double clicks
 * reuse the same account (Stripe idempotency key + one row per restaurant).
 */
export async function connectRestaurantAccount(input: {
  restaurantId: string;
  restaurantName: string;
  contactEmail: string | null;
  userId: string;
}): Promise<RestaurantStripeAccount> {
  const existing = await getRestaurantStripeAccount(input.restaurantId);

  if (existing) {
    return existing;
  }

  const { stripe, admin } = clients();
  const livemode = isStripeLiveMode();
  const account = await stripe.v2.core.accounts.create(
    {
      display_name: input.restaurantName.slice(0, 100),
      ...(input.contactEmail ? { contact_email: input.contactEmail } : {}),
      dashboard: "full",
      identity: { country: "ae", entity_type: "company" },
      configuration: {
        merchant: { capabilities: { card_payments: { requested: true } } },
        // Lets the same account pay WhatsOrder's subscription later (Billing).
        customer: {}
      },
      defaults: {
        currency: "aed",
        responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
        locales: ["en-US"]
      },
      metadata: { whatsorder_restaurant_id: input.restaurantId },
      include: ["configuration.merchant", "requirements"]
    },
    { idempotencyKey: `whatsorder-connect-${livemode ? "live" : "test"}-${input.restaurantId}` }
  );

  const row: RestaurantStripeAccount = {
    restaurant_id: input.restaurantId,
    stripe_account_id: account.id,
    livemode,
    card_payments_status: cardPaymentsStatusOf(account),
    requirements_due: requirementsDueOf(account),
    status_checked_at: new Date().toISOString()
  };

  const { error } = await admin
    .from("restaurant_stripe_accounts")
    .upsert({ ...row, created_by_user_id: input.userId }, { onConflict: "restaurant_id", ignoreDuplicates: true });

  if (error) {
    throw new StripeConnectError("unavailable");
  }

  // Return what is stored (a concurrent request may have saved first).
  return (await getRestaurantStripeAccount(input.restaurantId)) ?? row;
}

/** Re-reads the account from Stripe and stores its current status. */
export async function syncRestaurantStripeAccount(
  restaurantId: string
): Promise<RestaurantStripeAccount | null> {
  const current = await getRestaurantStripeAccount(restaurantId);

  if (!current) {
    return null;
  }

  const { stripe, admin } = clients();
  const account = await stripe.v2.core.accounts.retrieve(current.stripe_account_id, {
    include: ["configuration.merchant", "requirements"]
  });
  const next = {
    card_payments_status: cardPaymentsStatusOf(account),
    requirements_due: requirementsDueOf(account),
    status_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  await admin
    .from("restaurant_stripe_accounts")
    .update(next)
    .eq("restaurant_id", restaurantId)
    .eq("stripe_account_id", current.stripe_account_id);

  return { ...current, ...next };
}

/**
 * Short-lived secret for Stripe's embedded onboarding and notification
 * banner. Only ever issued for the session restaurant's own account.
 */
export async function createOnboardingClientSecret(restaurantId: string): Promise<string> {
  const current = await getRestaurantStripeAccount(restaurantId);

  if (!current) {
    throw new StripeConnectError("not_connected");
  }

  const { stripe } = clients();
  const session = await stripe.accountSessions.create({
    account: current.stripe_account_id,
    components: {
      account_onboarding: { enabled: true },
      notification_banner: { enabled: true }
    }
  });

  return session.client_secret;
}
