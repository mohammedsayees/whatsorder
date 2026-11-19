import "server-only";

import type Stripe from "stripe";
import { amountDue } from "@/lib/owner-billing";
import { getOwnerInvoice, recordPayment } from "@/lib/billing-data";
import { getStripe, isStripeLiveMode } from "@/lib/stripe/server";
import { toMinorUnits } from "@/lib/stripe/order-payment-rules";
import { getSupabaseAdmin } from "@/lib/supabase";

// Card payments for WhatsOrder's own invoices, on the WhatsOrder (platform)
// Stripe account. The billing engine stays the source of truth: Stripe only
// collects the money, and each payment is recorded through
// record_billing_payment with the PaymentIntent as its idempotency key.
// Every function is scoped by the restaurant id from the verified session or
// from our own metadata on a signed Stripe event.

export const BILLING_INVOICE_KIND = "whatsorder_invoice";
export const BILLING_CARD_SETUP_KIND = "whatsorder_card_setup";
export const BILLING_AUTOPAY_KIND = "whatsorder_autopay";

/** Autopay tries an invoice at most this many times, this many days apart. */
export const AUTOPAY_MAX_ATTEMPTS = 3;
export const AUTOPAY_RETRY_DAYS = 2;

export type BillingCard = {
  restaurant_id: string;
  stripe_customer_id: string;
  livemode: boolean;
  payment_method_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: number | null;
  card_exp_year: number | null;
  autopay_enabled: boolean;
  autopay_consented_at: string | null;
};

export class BillingCardError extends Error {
  constructor(readonly code: "not_configured" | "unavailable" | "nothing_due" | "no_card") {
    super(code);
  }
}

const CARD_COLUMNS =
  "restaurant_id,stripe_customer_id,livemode,payment_method_id,card_brand,card_last4,card_exp_month,card_exp_year,autopay_enabled,autopay_consented_at";

function clients() {
  const stripe = getStripe();
  const admin = getSupabaseAdmin();
  if (!stripe) throw new BillingCardError("not_configured");
  if (!admin) throw new BillingCardError("unavailable");
  return { stripe, admin };
}

export function isCardBillingAvailable() {
  return Boolean(getStripe());
}

export async function getBillingCard(restaurantId: string): Promise<BillingCard | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from("restaurant_billing_cards")
    .select(CARD_COLUMNS)
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (error) return null;
  const row = data as BillingCard | null;
  // Never mix test and live Stripe objects.
  return row && row.livemode === isStripeLiveMode() ? row : null;
}

/** The restaurant's Stripe Customer on the WhatsOrder account (created once). */
export async function ensureBillingCustomer(input: {
  restaurantId: string;
  restaurantName: string;
  email: string | null;
}): Promise<BillingCard> {
  const existing = await getBillingCard(input.restaurantId);
  if (existing) return existing;

  const { stripe, admin } = clients();
  const livemode = isStripeLiveMode();
  const customer = await stripe.customers.create(
    {
      name: input.restaurantName.slice(0, 200),
      ...(input.email ? { email: input.email } : {}),
      metadata: { whatsorder_restaurant_id: input.restaurantId }
    },
    { idempotencyKey: `whatsorder-billing-customer-${livemode ? "live" : "test"}-${input.restaurantId}` }
  );

  const { error } = await admin.from("restaurant_billing_cards").upsert(
    { restaurant_id: input.restaurantId, stripe_customer_id: customer.id, livemode },
    { onConflict: "restaurant_id", ignoreDuplicates: true }
  );
  if (error) throw new BillingCardError("unavailable");

  const stored = await getBillingCard(input.restaurantId);
  if (!stored) throw new BillingCardError("unavailable");
  return stored;
}

function sessionExpiry() {
  return Math.floor(Date.now() / 1000) + 35 * 60;
}

/** Stripe Checkout for the unpaid balance of one issued invoice. */
export async function createInvoiceCheckoutUrl(input: {
  restaurantId: string;
  restaurantName: string;
  email: string | null;
  invoiceId: string;
  saveCardForAutopay: boolean;
  userId: string;
  origin: string;
}): Promise<string> {
  const invoice = await getOwnerInvoice(input.restaurantId, input.invoiceId);
  const due = invoice && invoice.status === "issued" ? amountDue(invoice) : 0;
  if (!invoice || due <= 0) throw new BillingCardError("nothing_due");

  const { stripe } = clients();
  const card = await ensureBillingCustomer(input);
  const metadata = {
    kind: BILLING_INVOICE_KIND,
    whatsorder_restaurant_id: input.restaurantId,
    whatsorder_invoice_id: invoice.id,
    autopay_consent_user_id: input.saveCardForAutopay ? input.userId : ""
  };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: card.stripe_customer_id,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: invoice.currency.toLowerCase(),
          unit_amount: toMinorUnits(due),
          product_data: { name: `WhatsOrder invoice ${invoice.invoice_number}` }
        }
      }
    ],
    client_reference_id: invoice.id,
    metadata,
    payment_intent_data: {
      metadata,
      description: `WhatsOrder invoice ${invoice.invoice_number}`,
      ...(input.saveCardForAutopay ? { setup_future_usage: "off_session" as const } : {})
    },
    expires_at: sessionExpiry(),
    success_url: `${input.origin}/admin/billing?card=paid`,
    cancel_url: `${input.origin}/admin/billing`
  });
  if (!session.url) throw new BillingCardError("unavailable");
  return session.url;
}

/** Stripe Checkout (setup mode) to save a card for autopay without paying. */
export async function createCardSetupUrl(input: {
  restaurantId: string;
  restaurantName: string;
  email: string | null;
  userId: string;
  origin: string;
}): Promise<string> {
  const { stripe } = clients();
  const card = await ensureBillingCustomer(input);
  const metadata = {
    kind: BILLING_CARD_SETUP_KIND,
    whatsorder_restaurant_id: input.restaurantId,
    autopay_consent_user_id: input.userId
  };
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    currency: "aed",
    customer: card.stripe_customer_id,
    metadata,
    setup_intent_data: { metadata, description: "WhatsOrder autopay card" },
    expires_at: sessionExpiry(),
    success_url: `${input.origin}/admin/billing?card=saved`,
    cancel_url: `${input.origin}/admin/billing`
  });
  if (!session.url) throw new BillingCardError("unavailable");
  return session.url;
}

/** Stores a card's display details and turns autopay on (owner consented). */
async function saveCardForAutopay(
  restaurantId: string,
  customerId: string,
  paymentMethodId: string,
  consentUserId: string | null
) {
  const { stripe, admin } = clients();
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
  const card = paymentMethod.card;
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: paymentMethodId }
  });
  const now = new Date().toISOString();
  await admin
    .from("restaurant_billing_cards")
    .update({
      payment_method_id: paymentMethodId,
      card_brand: card?.brand ?? null,
      card_last4: card?.last4 ?? null,
      card_exp_month: card?.exp_month ?? null,
      card_exp_year: card?.exp_year ?? null,
      autopay_enabled: true,
      autopay_consented_at: now,
      autopay_consented_by_user_id: consentUserId,
      updated_at: now
    })
    .eq("restaurant_id", restaurantId)
    .eq("stripe_customer_id", customerId);
}

/**
 * Records a successful card payment against its invoice. Webhook and autopay
 * may both report the same PaymentIntent: the idempotency key makes that one
 * payment. Returns false when the engine refused it (e.g. already settled by
 * bank transfer), which needs a manual refund from the Stripe Dashboard.
 */
export async function recordInvoiceCardPayment(input: {
  restaurantId: string;
  invoiceId: string;
  amountMinor: number;
  paymentIntentId: string;
}): Promise<boolean> {
  const result = await recordPayment(input.restaurantId, input.invoiceId, {
    amount: input.amountMinor / 100,
    method: "card",
    reference: input.paymentIntentId,
    idempotencyKey: `stripe:${input.paymentIntentId}`,
    actor: { userId: null, role: "stripe" }
  });
  if (!result.ok) {
    console.error("WhatsOrder billing: card payment NOT recorded — check and refund in Stripe", {
      restaurantId: input.restaurantId,
      invoiceId: input.invoiceId,
      paymentIntentId: input.paymentIntentId,
      error: result.error
    });
  }
  return result.ok;
}

function idOf(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

/** Applies a completed Checkout Session from the platform webhook. */
export async function applyBillingCheckoutSession(session: Stripe.Checkout.Session): Promise<"handled" | "ignored"> {
  const restaurantId = session.metadata?.whatsorder_restaurant_id;
  const kind = session.metadata?.kind;
  if (!restaurantId || (kind !== BILLING_INVOICE_KIND && kind !== BILLING_CARD_SETUP_KIND)) return "ignored";

  // The session's customer must be this restaurant's own Customer.
  const card = await getBillingCard(restaurantId);
  if (!card || idOf(session.customer) !== card.stripe_customer_id) return "ignored";

  const { stripe } = clients();
  const consentUserId = session.metadata?.autopay_consent_user_id || null;

  if (kind === BILLING_CARD_SETUP_KIND) {
    const setupIntentId = idOf(session.setup_intent);
    if (session.status !== "complete" || !setupIntentId) return "ignored";
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const paymentMethodId = idOf(setupIntent.payment_method);
    if (setupIntent.status !== "succeeded" || !paymentMethodId) return "ignored";
    await saveCardForAutopay(restaurantId, card.stripe_customer_id, paymentMethodId, consentUserId);
    return "handled";
  }

  const invoiceId = session.metadata?.whatsorder_invoice_id;
  const paymentIntentId = idOf(session.payment_intent);
  if (session.payment_status !== "paid" || !invoiceId || !paymentIntentId || !session.amount_total) {
    return "ignored";
  }
  await recordInvoiceCardPayment({
    restaurantId,
    invoiceId,
    amountMinor: session.amount_total,
    paymentIntentId
  });
  if (consentUserId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const paymentMethodId = idOf(paymentIntent.payment_method);
    if (paymentMethodId) {
      await saveCardForAutopay(restaurantId, card.stripe_customer_id, paymentMethodId, consentUserId);
    }
  }
  return "handled";
}

/** Autopay PaymentIntent confirmed later (e.g. after a delayed confirmation). */
export async function applyAutopayPaymentIntent(intent: Stripe.PaymentIntent): Promise<"handled" | "ignored"> {
  const restaurantId = intent.metadata?.whatsorder_restaurant_id;
  const invoiceId = intent.metadata?.whatsorder_invoice_id;
  if (intent.metadata?.kind !== BILLING_AUTOPAY_KIND || !restaurantId || !invoiceId) return "ignored";
  const card = await getBillingCard(restaurantId);
  if (!card || idOf(intent.customer) !== card.stripe_customer_id || intent.status !== "succeeded") return "ignored";
  await recordInvoiceCardPayment({ restaurantId, invoiceId, amountMinor: intent.amount_received, paymentIntentId: intent.id });
  return "handled";
}

export async function setAutopay(restaurantId: string, enabled: boolean, userId: string) {
  const { admin } = clients();
  const card = await getBillingCard(restaurantId);
  if (!card?.payment_method_id) throw new BillingCardError("no_card");
  const now = new Date().toISOString();
  await admin
    .from("restaurant_billing_cards")
    .update(
      enabled
        ? { autopay_enabled: true, autopay_consented_at: now, autopay_consented_by_user_id: userId, updated_at: now }
        : { autopay_enabled: false, updated_at: now }
    )
    .eq("restaurant_id", restaurantId)
    .eq("stripe_customer_id", card.stripe_customer_id);
}

export async function removeBillingCard(restaurantId: string) {
  const { stripe, admin } = clients();
  const card = await getBillingCard(restaurantId);
  if (!card?.payment_method_id) return;
  try {
    await stripe.paymentMethods.detach(card.payment_method_id);
  } catch {
    // Already detached in Stripe; clear our copy regardless.
  }
  await admin
    .from("restaurant_billing_cards")
    .update({
      payment_method_id: null,
      card_brand: null,
      card_last4: null,
      card_exp_month: null,
      card_exp_year: null,
      autopay_enabled: false,
      updated_at: new Date().toISOString()
    })
    .eq("restaurant_id", restaurantId)
    .eq("stripe_customer_id", card.stripe_customer_id);
}

export type AutopaySummary = { attempted: number; charged: number; failed: number };

type AutopayInvoice = {
  id: string;
  restaurant_id: string;
  invoice_number: string;
  currency: string;
  total: number;
  autopay_attempts: number;
  autopay_last_attempt_at: string | null;
};

export function isAutopayDue(invoice: Pick<AutopayInvoice, "autopay_attempts" | "autopay_last_attempt_at">, now: Date) {
  if (invoice.autopay_attempts >= AUTOPAY_MAX_ATTEMPTS) return false;
  if (!invoice.autopay_last_attempt_at) return true;
  return now.getTime() - new Date(invoice.autopay_last_attempt_at).getTime() >= AUTOPAY_RETRY_DAYS * 86_400_000 - 3_600_000;
}

/**
 * Daily autopay pass (runs after invoices are issued): charges each issued
 * invoice of an autopay restaurant off-session, at most AUTOPAY_MAX_ATTEMPTS
 * times. A failed charge leaves the invoice issued, so the engine's usual
 * past-due/grace/suspend rules apply.
 */
export async function runAutopay(now: Date = new Date()): Promise<AutopaySummary> {
  const summary: AutopaySummary = { attempted: 0, charged: 0, failed: 0 };
  const stripe = getStripe();
  const admin = getSupabaseAdmin();
  if (!stripe || !admin) return summary;

  const { data: cards } = await admin
    .from("restaurant_billing_cards")
    .select(CARD_COLUMNS)
    .eq("autopay_enabled", true)
    .eq("livemode", isStripeLiveMode())
    .not("payment_method_id", "is", null);

  for (const card of (cards as BillingCard[] | null) ?? []) {
    const { data: invoices } = await admin
      .from("invoices")
      .select("id,restaurant_id,invoice_number,currency,total,autopay_attempts,autopay_last_attempt_at")
      .eq("restaurant_id", card.restaurant_id)
      .eq("status", "issued")
      .lt("autopay_attempts", AUTOPAY_MAX_ATTEMPTS);

    for (const invoice of (invoices as AutopayInvoice[] | null) ?? []) {
      if (!isAutopayDue(invoice, now)) continue;
      const owner = await getOwnerInvoice(card.restaurant_id, invoice.id);
      const due = owner ? amountDue(owner) : 0;
      if (due <= 0) continue;

      const attempt = invoice.autopay_attempts + 1;
      summary.attempted += 1;
      let error: string | null = null;
      try {
        const intent = await stripe.paymentIntents.create(
          {
            amount: toMinorUnits(due),
            currency: invoice.currency.toLowerCase(),
            customer: card.stripe_customer_id,
            payment_method: card.payment_method_id!,
            off_session: true,
            confirm: true,
            description: `WhatsOrder invoice ${invoice.invoice_number} (autopay)`,
            metadata: {
              kind: BILLING_AUTOPAY_KIND,
              whatsorder_restaurant_id: card.restaurant_id,
              whatsorder_invoice_id: invoice.id
            }
          },
          { idempotencyKey: `whatsorder-autopay-${invoice.id}-${attempt}` }
        );
        if (intent.status === "succeeded") {
          await recordInvoiceCardPayment({
            restaurantId: card.restaurant_id,
            invoiceId: invoice.id,
            amountMinor: intent.amount_received,
            paymentIntentId: intent.id
          });
          summary.charged += 1;
        } else if (intent.status !== "processing") {
          error = `Payment needs attention (${intent.status})`;
        }
      } catch (stripeError) {
        const declined = stripeError as { code?: string; decline_code?: string; message?: string };
        error = (declined.decline_code ?? declined.code ?? declined.message ?? "Card charge failed").slice(0, 200);
      }
      if (error) summary.failed += 1;

      await admin
        .from("invoices")
        .update({
          autopay_attempts: attempt,
          autopay_last_attempt_at: now.toISOString(),
          autopay_last_error: error
        })
        .eq("restaurant_id", card.restaurant_id)
        .eq("id", invoice.id);
    }
  }
  return summary;
}
