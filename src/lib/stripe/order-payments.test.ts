import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyCheckoutSessionToOrder, checkoutUrlForOrder, resetDirectAccountReadyCache } from "@/lib/stripe/order-payments";
import { getRestaurantStripeAccount } from "@/lib/stripe/connect-data";
import { getDirectRestaurantId, getStripe, isOrderPaymentWebhookConfigured } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/stripe/server", () => ({
  getStripe: vi.fn(),
  isOrderPaymentWebhookConfigured: vi.fn(() => true),
  isBillingWebhookConfigured: vi.fn(() => true),
  getDirectRestaurantId: vi.fn(() => null)
}));
vi.mock("@/lib/push-auth", () => ({ isPushAuthorizationConfigured: () => true }));
vi.mock("@/lib/stripe/connect-data", () => ({ getRestaurantStripeAccount: vi.fn() }));

const restaurant = { id: "2e000000-0000-0000-0000-000000000001", name: "Chai Xpress", slug: "chaixpress", country_code: "AE", currency_code: "AED" };
const orderId = "4e000000-0000-4000-8000-0000abcdef12";

type Call = { op: string; payload?: unknown; filters: [string, string, unknown][] };

function mockOrders(order: Record<string, unknown> | null) {
  const calls: Call[] = [];
  const from = () => {
    const call: Call = { op: "select", filters: [] };
    calls.push(call);
    const b: Record<string, unknown> = {};
    const filter = (kind: string) => (column: string, value: unknown) => {
      call.filters.push([kind, column, value]);
      return b;
    };
    b.select = () => b;
    b.update = (payload: unknown) => {
      call.op = "update";
      call.payload = payload;
      return b;
    };
    b.eq = filter("eq");
    b.in = filter("in");
    b.not = (column: string, _op: string, value: unknown) => filter("not")(column, value);
    b.maybeSingle = async () => ({ data: order, error: null });
    b.then = (resolve: (value: unknown) => void) => resolve({ data: [{ id: orderId }], error: null });
    return b;
  };
  vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);
  return calls;
}

function mockStripe(existing?: Record<string, unknown>) {
  const stripe = {
    accounts: { retrieveCurrent: vi.fn(async () => ({ charges_enabled: true })) },
    checkout: {
      sessions: {
        create: vi.fn(async () => ({ id: "cs_test_new", url: "https://checkout.stripe.com/c/pay/cs_test_new" })),
        retrieve: vi.fn(async () => existing)
      }
    }
  };
  vi.mocked(getStripe).mockReturnValue(stripe as never);
  return stripe;
}

const activeAccount = { restaurant_id: restaurant.id, stripe_account_id: "acct_1TestAAAAAAAAAAA", livemode: false, card_payments_status: "active", requirements_due: false, status_checked_at: null };

describe("Pay online checkout sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getRestaurantStripeAccount).mockResolvedValue(activeAccount as never);
  });

  it("charges the saved order total directly on the restaurant's account", async () => {
    const calls = mockOrders({ id: orderId, total: 42.5, status: "New", online_payment_status: "pending", stripe_checkout_session_id: null });
    const stripe = mockStripe();
    const url = await checkoutUrlForOrder({ restaurant, orderId, origin: "https://app.example" });

    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_test_new");
    const [params, options] = stripe.checkout.sessions.create.mock.calls[0] as unknown as [Record<string, any>, Record<string, string>];
    expect(options.stripeAccount).toBe("acct_1TestAAAAAAAAAAA");
    expect(options.idempotencyKey).toBe(`whatsorder-order-${orderId}-first`);
    expect(params.line_items[0].price_data).toMatchObject({ currency: "aed", unit_amount: 4250 });
    expect(params.metadata).toEqual({ whatsorder_order_id: orderId, whatsorder_restaurant_id: restaurant.id });
    expect(params.success_url).toBe(`https://app.example/r/chaixpress/thank-you?order=${orderId}&payment=done`);
    expect(params.application_fee_amount).toBeUndefined();
    const update = calls.find((call) => call.op === "update");
    expect(update?.payload).toEqual({ stripe_checkout_session_id: "cs_test_new", online_payment_status: "pending" });
    expect(update?.filters).toContainEqual(["eq", "restaurant_id", restaurant.id]);
  });

  it("reuses the open session instead of creating another", async () => {
    mockOrders({ id: orderId, total: 10, status: "New", online_payment_status: "pending", stripe_checkout_session_id: "cs_test_open" });
    const stripe = mockStripe({ id: "cs_test_open", status: "open", url: "https://checkout.stripe.com/c/pay/cs_test_open" });
    expect(await checkoutUrlForOrder({ restaurant, orderId, origin: "https://app.example" })).toBe("https://checkout.stripe.com/c/pay/cs_test_open");
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_test_open", {}, { stripeAccount: "acct_1TestAAAAAAAAAAA" });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("never opens a payment page for cash, paid, closed or not-ready orders", async () => {
    const stripe = mockStripe();
    mockOrders({ id: orderId, total: 10, status: "New", online_payment_status: null, stripe_checkout_session_id: null });
    expect(await checkoutUrlForOrder({ restaurant, orderId, origin: "https://a" })).toBeNull();
    mockOrders({ id: orderId, total: 10, status: "New", online_payment_status: "paid", stripe_checkout_session_id: "cs_test_x" });
    expect(await checkoutUrlForOrder({ restaurant, orderId, origin: "https://a" })).toBeNull();
    mockOrders({ id: orderId, total: 10, status: "Cancelled", online_payment_status: "pending", stripe_checkout_session_id: null });
    expect(await checkoutUrlForOrder({ restaurant, orderId, origin: "https://a" })).toBeNull();
    mockOrders({ id: orderId, total: 10, status: "New", online_payment_status: "pending", stripe_checkout_session_id: null });
    vi.mocked(getRestaurantStripeAccount).mockResolvedValue({ ...activeAccount, card_payments_status: "restricted" } as never);
    expect(await checkoutUrlForOrder({ restaurant, orderId, origin: "https://a" })).toBeNull();
    expect(await checkoutUrlForOrder({ restaurant: { ...restaurant, country_code: "IN" }, orderId, origin: "https://a" })).toBeNull();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("single-café mode charges that café on the platform account and nobody else", async () => {
    mockOrders({ id: orderId, total: 12, status: "New", online_payment_status: "pending", stripe_checkout_session_id: null });
    const stripe = mockStripe();
    vi.mocked(getDirectRestaurantId).mockReturnValue(restaurant.id);
    vi.mocked(getRestaurantStripeAccount).mockResolvedValue(null);
    resetDirectAccountReadyCache();

    // Not activated yet in Stripe: no Pay online.
    stripe.accounts.retrieveCurrent.mockResolvedValueOnce({ charges_enabled: false });
    expect(await checkoutUrlForOrder({ restaurant, orderId, origin: "https://a" })).toBeNull();
    resetDirectAccountReadyCache();

    expect(await checkoutUrlForOrder({ restaurant, orderId, origin: "https://a" })).toBe("https://checkout.stripe.com/c/pay/cs_test_new");
    const [params, options] = stripe.checkout.sessions.create.mock.calls[0] as unknown as [Record<string, any>, Record<string, string>];
    expect(options.stripeAccount).toBeUndefined();
    expect(params.metadata.whatsorder_restaurant_id).toBe(restaurant.id);

    // Another café gets no Pay online, even with a connected account row.
    vi.mocked(getRestaurantStripeAccount).mockResolvedValue(activeAccount as never);
    expect(await checkoutUrlForOrder({ restaurant: { ...restaurant, id: "other-cafe" }, orderId, origin: "https://a" })).toBeNull();
    vi.mocked(getDirectRestaurantId).mockReturnValue(null);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledTimes(1);
  });

  it("hides Pay online until the order webhook is configured", async () => {
    const stripe = mockStripe();
    mockOrders({ id: orderId, total: 10, status: "New", online_payment_status: "pending", stripe_checkout_session_id: null });
    vi.mocked(isOrderPaymentWebhookConfigured).mockReturnValue(false);
    expect(await checkoutUrlForOrder({ restaurant, orderId, origin: "https://a" })).toBeNull();
    vi.mocked(isOrderPaymentWebhookConfigured).mockReturnValue(true);
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("records a paid session only on the matching restaurant + session", async () => {
    const calls = mockOrders(null);
    expect(await applyCheckoutSessionToOrder(restaurant.id, { id: "cs_test_1", status: "complete", payment_status: "paid", payment_intent: "pi_1" })).toBe("paid");
    const update = calls.find((call) => call.op === "update");
    expect(update?.payload).toMatchObject({ online_payment_status: "paid", payment_method: "Online Payment", stripe_payment_intent_id: "pi_1" });
    expect(update?.filters).toEqual([
      ["eq", "restaurant_id", restaurant.id],
      ["eq", "stripe_checkout_session_id", "cs_test_1"],
      ["in", "online_payment_status", ["pending", "expired", "failed"]]
    ]);
    // An unpaid open session changes nothing.
    expect(await applyCheckoutSessionToOrder(restaurant.id, { id: "cs_test_1", status: "open", payment_status: "unpaid", payment_intent: null })).toBeNull();
  });
});
