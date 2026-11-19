import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyBillingCheckoutSession,
  createInvoiceCheckoutUrl,
  isAutopayDue,
  runAutopay
} from "@/lib/stripe/billing";
import { getOwnerInvoice, recordPayment } from "@/lib/billing-data";
import { getDirectRestaurantId, getStripe, isBillingWebhookConfigured } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/stripe/server", () => ({
  getStripe: vi.fn(),
  isStripeLiveMode: () => false,
  isBillingWebhookConfigured: vi.fn(() => true),
  getDirectRestaurantId: vi.fn(() => null)
}));
vi.mock("@/lib/billing-data", () => ({ getOwnerInvoice: vi.fn(), recordPayment: vi.fn(async () => ({ ok: true })) }));

const restaurantId = "2f100000-0000-0000-0000-000000000001";
const invoiceId = "6f100000-0000-0000-0000-000000000001";
const card = {
  restaurant_id: restaurantId,
  stripe_customer_id: "cus_TestAAAAAAAA",
  livemode: false,
  payment_method_id: "pm_TestAAAAAAAA",
  card_brand: "visa",
  card_last4: "4242",
  card_exp_month: 12,
  card_exp_year: 2030,
  autopay_enabled: true,
  autopay_consented_at: "2026-11-01T00:00:00Z"
};

type Call = { table: string; op: string; payload?: unknown; filters: [string, unknown][] };

function mockDb(tables: Record<string, unknown>) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const b: Record<string, unknown> = {};
    const f = (column: string, value: unknown) => {
      call.filters.push([column, value]);
      return b;
    };
    b.select = () => b;
    b.eq = f;
    b.lt = f;
    b.not = (column: string, _op: string, value: unknown) => f(column, value);
    b.update = (payload: unknown) => {
      call.op = "update";
      call.payload = payload;
      return b;
    };
    b.upsert = async (payload: unknown) => {
      call.op = "upsert";
      call.payload = payload;
      return { error: null };
    };
    b.maybeSingle = async () => ({ data: tables[table] ?? null, error: null });
    b.then = (resolve: (value: unknown) => void) =>
      resolve({ data: Array.isArray(tables[`${table}[]`]) ? tables[`${table}[]`] : [], error: null });
    return b;
  };
  vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);
  return calls;
}

function mockStripe() {
  const stripe = {
    customers: { create: vi.fn(async () => ({ id: "cus_TestAAAAAAAA" })), update: vi.fn(async () => ({})) },
    checkout: { sessions: { create: vi.fn(async () => ({ url: "https://checkout.stripe.com/c/pay/cs_test_b" })) } },
    paymentIntents: {
      create: vi.fn(async () => ({ id: "pi_auto", status: "succeeded", amount_received: 14900 })),
      retrieve: vi.fn(async () => ({ payment_method: "pm_NewAAAAAAAA" }))
    },
    paymentMethods: { retrieve: vi.fn(async () => ({ card: { brand: "visa", last4: "1111", exp_month: 1, exp_year: 2031 } })) },
    setupIntents: { retrieve: vi.fn() }
  };
  vi.mocked(getStripe).mockReturnValue(stripe as never);
  return stripe;
}

const issuedInvoice = { id: invoiceId, invoice_number: "WO-2026-0001", status: "issued", total: 149, paid_to_date: 49, currency: "AED" };

describe("WhatsOrder invoices by card", () => {
  beforeEach(() => vi.clearAllMocks());

  it("charges only the unpaid balance, on the restaurant's own Customer", async () => {
    mockDb({ restaurant_billing_cards: card });
    const stripe = mockStripe();
    vi.mocked(getOwnerInvoice).mockResolvedValue(issuedInvoice as never);

    await createInvoiceCheckoutUrl({ restaurantId, restaurantName: "Chai", email: null, invoiceId, saveCardForAutopay: false, userId: "u1", origin: "https://app" });
    const [params] = stripe.checkout.sessions.create.mock.calls[0] as unknown as [Record<string, any>];
    expect(params.customer).toBe("cus_TestAAAAAAAA");
    expect(params.line_items[0].price_data).toMatchObject({ currency: "aed", unit_amount: 10000 });
    expect(params.payment_intent_data.setup_future_usage).toBeUndefined();
    expect(params.metadata).toMatchObject({ kind: "whatsorder_invoice", whatsorder_restaurant_id: restaurantId, whatsorder_invoice_id: invoiceId });

    await createInvoiceCheckoutUrl({ restaurantId, restaurantName: "Chai", email: null, invoiceId, saveCardForAutopay: true, userId: "u1", origin: "https://app" });
    const [withSave] = stripe.checkout.sessions.create.mock.calls[1] as unknown as [Record<string, any>];
    expect(withSave.payment_intent_data.setup_future_usage).toBe("off_session");
    expect(withSave.metadata.autopay_consent_user_id).toBe("u1");
  });

  it("refuses paid, void or another restaurant's invoices", async () => {
    mockDb({ restaurant_billing_cards: card });
    const stripe = mockStripe();
    vi.mocked(getOwnerInvoice).mockResolvedValue(null);
    await expect(createInvoiceCheckoutUrl({ restaurantId, restaurantName: "C", email: null, invoiceId, saveCardForAutopay: false, userId: "u", origin: "o" })).rejects.toMatchObject({ code: "nothing_due" });
    vi.mocked(getOwnerInvoice).mockResolvedValue({ ...issuedInvoice, status: "paid" } as never);
    await expect(createInvoiceCheckoutUrl({ restaurantId, restaurantName: "C", email: null, invoiceId, saveCardForAutopay: false, userId: "u", origin: "o" })).rejects.toMatchObject({ code: "nothing_due" });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("records a paid session once per PaymentIntent and saves the card when consented", async () => {
    const calls = mockDb({ restaurant_billing_cards: card });
    const stripe = mockStripe();
    const session = {
      customer: "cus_TestAAAAAAAA",
      payment_status: "paid",
      status: "complete",
      amount_total: 10000,
      payment_intent: "pi_123",
      metadata: { kind: "whatsorder_invoice", whatsorder_restaurant_id: restaurantId, whatsorder_invoice_id: invoiceId, autopay_consent_user_id: "u1" }
    };
    expect(await applyBillingCheckoutSession(session as never)).toBe("handled");
    expect(recordPayment).toHaveBeenCalledWith(restaurantId, invoiceId, expect.objectContaining({
      amount: 100, method: "card", reference: "pi_123", idempotencyKey: "stripe:pi_123"
    }));
    expect(stripe.customers.update).toHaveBeenCalledWith("cus_TestAAAAAAAA", { invoice_settings: { default_payment_method: "pm_NewAAAAAAAA" } });
    const saved = calls.find((call) => call.op === "update" && call.table === "restaurant_billing_cards");
    expect(saved?.payload).toMatchObject({ payment_method_id: "pm_NewAAAAAAAA", card_last4: "1111", autopay_enabled: true, autopay_consented_by_user_id: "u1" });
    // The new card gets fresh autopay attempts on this restaurant's open invoices.
    const reset = calls.find((call) => call.op === "update" && call.table === "invoices");
    expect(reset?.payload).toEqual({ autopay_attempts: 0, autopay_last_error: null });
    expect(reset?.filters).toEqual([["restaurant_id", restaurantId], ["status", "issued"]]);
  });

  it("ignores sessions whose customer is not the restaurant's own", async () => {
    mockDb({ restaurant_billing_cards: card });
    mockStripe();
    const session = {
      customer: "cus_SomeoneElseAAA",
      payment_status: "paid",
      amount_total: 10000,
      payment_intent: "pi_123",
      metadata: { kind: "whatsorder_invoice", whatsorder_restaurant_id: restaurantId, whatsorder_invoice_id: invoiceId }
    };
    expect(await applyBillingCheckoutSession(session as never)).toBe("ignored");
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it("autopay charges off-session, records success and tracks declines", async () => {
    const calls = mockDb({
      "restaurant_billing_cards[]": [card],
      "invoices[]": [{ id: invoiceId, restaurant_id: restaurantId, invoice_number: "WO-1", currency: "AED", total: 149, autopay_attempts: 0, autopay_last_attempt_at: null }]
    });
    const stripe = mockStripe();
    vi.mocked(getOwnerInvoice).mockResolvedValue({ ...issuedInvoice, paid_to_date: 0 } as never);

    const now = new Date("2026-11-20T03:00:00Z");
    expect(await runAutopay(now)).toEqual({ attempted: 1, charged: 1, failed: 0 });
    const [params, options] = stripe.paymentIntents.create.mock.calls[0] as unknown as [Record<string, any>, Record<string, string>];
    expect(params).toMatchObject({ amount: 14900, currency: "aed", customer: "cus_TestAAAAAAAA", payment_method: "pm_TestAAAAAAAA", off_session: true, confirm: true });
    expect(options.idempotencyKey).toBe(`whatsorder-autopay-${invoiceId}-1`);
    expect(recordPayment).toHaveBeenCalledWith(restaurantId, invoiceId, expect.objectContaining({ idempotencyKey: "stripe:pi_auto" }));

    stripe.paymentIntents.create.mockRejectedValueOnce(Object.assign(new Error("Your card was declined."), { code: "card_declined", decline_code: "insufficient_funds" }));
    vi.mocked(recordPayment).mockClear();
    expect(await runAutopay(now)).toEqual({ attempted: 1, charged: 0, failed: 1 });
    expect(recordPayment).not.toHaveBeenCalled();
    const attempt = calls.filter((call) => call.op === "update" && call.table === "invoices").at(-1);
    expect(attempt?.payload).toMatchObject({ autopay_attempts: 1, autopay_last_error: "insufficient_funds" });
    expect(attempt?.filters).toEqual([["restaurant_id", restaurantId], ["id", invoiceId]]);
  });

  it("takes no card money until the billing webhook is configured", async () => {
    mockDb({ restaurant_billing_cards: card });
    const stripe = mockStripe();
    vi.mocked(getOwnerInvoice).mockResolvedValue(issuedInvoice as never);
    vi.mocked(isBillingWebhookConfigured).mockReturnValueOnce(false);
    await expect(createInvoiceCheckoutUrl({ restaurantId, restaurantName: "C", email: null, invoiceId, saveCardForAutopay: false, userId: "u", origin: "o" })).rejects.toMatchObject({ code: "not_configured" });
    vi.mocked(isBillingWebhookConfigured).mockReturnValueOnce(false);
    expect(await runAutopay(new Date())).toEqual({ attempted: 0, charged: 0, failed: 0 });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("keeps WhatsOrder card billing off in single-café mode", async () => {
    mockDb({ restaurant_billing_cards: card });
    const stripe = mockStripe();
    vi.mocked(getOwnerInvoice).mockResolvedValue(issuedInvoice as never);
    vi.mocked(getDirectRestaurantId).mockReturnValue("chai-xpress");
    await expect(createInvoiceCheckoutUrl({ restaurantId, restaurantName: "C", email: null, invoiceId, saveCardForAutopay: false, userId: "u", origin: "o" })).rejects.toMatchObject({ code: "not_configured" });
    expect(await runAutopay(new Date())).toEqual({ attempted: 0, charged: 0, failed: 0 });
    vi.mocked(getDirectRestaurantId).mockReturnValue(null);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("spaces retries and stops after three attempts", () => {
    const now = new Date("2026-11-20T03:00:00Z");
    expect(isAutopayDue({ autopay_attempts: 0, autopay_last_attempt_at: null }, now)).toBe(true);
    expect(isAutopayDue({ autopay_attempts: 1, autopay_last_attempt_at: "2026-11-19T03:00:00Z" }, now)).toBe(false);
    expect(isAutopayDue({ autopay_attempts: 1, autopay_last_attempt_at: "2026-11-18T03:00:00Z" }, now)).toBe(true);
    expect(isAutopayDue({ autopay_attempts: 3, autopay_last_attempt_at: "2026-11-01T03:00:00Z" }, now)).toBe(false);
  });
});
