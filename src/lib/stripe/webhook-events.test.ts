import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleDirectOrderEvent, handleStripeEvent } from "@/lib/stripe/webhook-events";
import { applyCheckoutSessionToOrder, markOrderRefunded } from "@/lib/stripe/order-payments";
import { getDirectRestaurantId, isStripeLiveMode } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/stripe/server", () => ({ isStripeLiveMode: vi.fn(() => false), getDirectRestaurantId: vi.fn(() => null) }));
vi.mock("@/lib/stripe/order-payments", () => ({
  applyCheckoutSessionToOrder: vi.fn(async () => "paid"),
  markOrderRefunded: vi.fn(async () => undefined)
}));

const restaurantId = "2e000000-0000-0000-0000-000000000001";

function mockAccounts(rows: Record<string, string>) {
  const filters: [string, unknown][] = [];
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = (column: string, value: unknown) => {
    filters.push([column, value]);
    return builder;
  };
  builder.maybeSingle = async () => {
    const account = filters.find(([column]) => column === "stripe_account_id")?.[1] as string;
    return { data: rows[account] ? { restaurant_id: rows[account] } : null, error: null };
  };
  vi.mocked(getSupabaseAdmin).mockReturnValue({ from: () => builder } as never);
  return filters;
}

function event(type: string, object: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return { type, account: "acct_1TestAAAAAAAAAAA", livemode: false, data: { object }, ...extra } as never;
}

describe("Stripe Connect webhook events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isStripeLiveMode).mockReturnValue(false);
  });

  it("marks the order paid for the restaurant that owns the connected account", async () => {
    const filters = mockAccounts({ acct_1TestAAAAAAAAAAA: restaurantId });
    const session = { id: "cs_test_1", status: "complete", payment_status: "paid", metadata: { whatsorder_restaurant_id: restaurantId } };
    expect(await handleStripeEvent(event("checkout.session.completed", session))).toBe("handled");
    expect(applyCheckoutSessionToOrder).toHaveBeenCalledWith(restaurantId, session);
    expect(filters).toContainEqual(["livemode", false]);
  });

  it("ignores events from unknown accounts, other modes and platform-level events", async () => {
    mockAccounts({});
    expect(await handleStripeEvent(event("checkout.session.completed", { id: "cs_test_1" }))).toBe("ignored");
    mockAccounts({ acct_1TestAAAAAAAAAAA: restaurantId });
    expect(await handleStripeEvent(event("checkout.session.completed", { id: "cs_test_1" }, { livemode: true }))).toBe("ignored");
    expect(await handleStripeEvent(event("checkout.session.completed", { id: "cs_test_1" }, { account: undefined }))).toBe("ignored");
    expect(applyCheckoutSessionToOrder).not.toHaveBeenCalled();
  });

  it("refuses a session whose metadata names another restaurant", async () => {
    mockAccounts({ acct_1TestAAAAAAAAAAA: restaurantId });
    const session = { id: "cs_test_1", status: "complete", payment_status: "paid", metadata: { whatsorder_restaurant_id: "other" } };
    expect(await handleStripeEvent(event("checkout.session.completed", session))).toBe("ignored");
    expect(applyCheckoutSessionToOrder).not.toHaveBeenCalled();
  });

  it("records expiry, failure and full refunds", async () => {
    mockAccounts({ acct_1TestAAAAAAAAAAA: restaurantId });
    await handleStripeEvent(event("checkout.session.expired", { id: "cs_test_1" }));
    expect(applyCheckoutSessionToOrder).toHaveBeenLastCalledWith(restaurantId, { id: "cs_test_1" }, "expired");
    await handleStripeEvent(event("checkout.session.async_payment_failed", { id: "cs_test_2" }));
    expect(applyCheckoutSessionToOrder).toHaveBeenLastCalledWith(restaurantId, { id: "cs_test_2" }, "failed");
    await handleStripeEvent(event("charge.refunded", { payment_intent: "pi_1", refunded: false }));
    expect(markOrderRefunded).not.toHaveBeenCalled();
    await handleStripeEvent(event("charge.refunded", { payment_intent: "pi_1", refunded: true }));
    expect(markOrderRefunded).toHaveBeenCalledWith(restaurantId, "pi_1");
  });

  it("single-café mode applies platform events only to that café's own orders", async () => {
    const platformEvent = (type: string, object: Record<string, unknown>) =>
      ({ type, account: undefined, livemode: false, data: { object } }) as never;
    const session = { id: "cs_test_9", status: "complete", payment_status: "paid", metadata: { whatsorder_order_id: "o1", whatsorder_restaurant_id: restaurantId } };

    expect(await handleDirectOrderEvent(platformEvent("checkout.session.completed", session))).toBe("ignored");

    vi.mocked(getDirectRestaurantId).mockReturnValue(restaurantId);
    expect(await handleDirectOrderEvent(platformEvent("checkout.session.completed", session))).toBe("handled");
    expect(applyCheckoutSessionToOrder).toHaveBeenLastCalledWith(restaurantId, session, undefined);
    await handleDirectOrderEvent(platformEvent("checkout.session.expired", session));
    expect(applyCheckoutSessionToOrder).toHaveBeenLastCalledWith(restaurantId, session, "expired");
    await handleDirectOrderEvent(platformEvent("charge.refunded", { payment_intent: "pi_9", refunded: true }));
    expect(markOrderRefunded).toHaveBeenCalledWith(restaurantId, "pi_9");

    // Not a WhatsOrder order, or another restaurant's metadata: ignored.
    vi.mocked(applyCheckoutSessionToOrder).mockClear();
    expect(await handleDirectOrderEvent(platformEvent("checkout.session.completed", { id: "cs_x", metadata: {} }))).toBe("ignored");
    expect(await handleDirectOrderEvent(platformEvent("checkout.session.completed", { ...session, metadata: { whatsorder_order_id: "o2", whatsorder_restaurant_id: "other" } }))).toBe("ignored");
    expect(applyCheckoutSessionToOrder).not.toHaveBeenCalled();
    vi.mocked(getDirectRestaurantId).mockReturnValue(null);
  });
});
