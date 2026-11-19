import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  StripeConnectError,
  connectRestaurantAccount,
  createOnboardingClientSecret,
  getRestaurantStripeAccount,
  syncRestaurantStripeAccount
} from "@/lib/stripe/connect-data";
import { getStripe, isStripeLiveMode } from "@/lib/stripe/server";
import { getSupabaseAdmin } from "@/lib/supabase";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/stripe/server", () => ({ getStripe: vi.fn(), isStripeLiveMode: vi.fn(() => false) }));

const restaurantId = "2d000000-0000-0000-0000-000000000001";

/** One-table Supabase stand-in for restaurant_stripe_accounts. */
function mockTable(initial: Record<string, unknown> | null) {
  let row = initial;
  const writes: { op: string; payload?: unknown; filters: [string, unknown][] }[] = [];
  const from = () => {
    const op = { op: "select", payload: undefined as unknown, filters: [] as [string, unknown][] };
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (column: string, value: unknown) => {
      op.filters.push([column, value]);
      return b;
    };
    b.maybeSingle = async () => ({ data: row, error: null });
    b.upsert = async (payload: Record<string, unknown>) => {
      writes.push({ op: "upsert", payload, filters: [] });
      if (!row) {
        const { created_by_user_id: _ignored, ...stored } = payload;
        row = stored;
      }
      return { error: null };
    };
    b.update = (payload: Record<string, unknown>) => {
      op.op = "update";
      op.payload = payload;
      writes.push(op);
      row = row ? { ...row, ...payload } : row;
      return b;
    };
    b.then = (resolve: (value: unknown) => void) => resolve({ error: null });
    return b;
  };
  vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);
  return writes;
}

function mockStripe(account: Record<string, unknown>) {
  const stripe = {
    v2: {
      core: {
        accounts: {
          create: vi.fn(async () => account),
          retrieve: vi.fn(async () => account)
        }
      }
    },
    accountSessions: { create: vi.fn(async () => ({ client_secret: "accs_secret_test" })) }
  };
  vi.mocked(getStripe).mockReturnValue(stripe as never);
  return stripe;
}

const restrictedAccount = {
  id: "acct_1TestAAAAAAAAAAA",
  configuration: { merchant: { capabilities: { card_payments: { status: "restricted" } } } },
  requirements: { summary: { minimum_deadline: { status: "past_due" } } }
};

describe("restaurant Stripe accounts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isStripeLiveMode).mockReturnValue(false);
  });

  it("creates one direct-charges account with Stripe-owned fees and losses", async () => {
    const writes = mockTable(null);
    const stripe = mockStripe(restrictedAccount);

    const saved = await connectRestaurantAccount({
      restaurantId,
      restaurantName: "Chai Xpress",
      contactEmail: "owner@example.com",
      userId: "user-1"
    });

    const [params, options] = stripe.v2.core.accounts.create.mock.calls[0] as unknown as [
      Record<string, any>,
      { idempotencyKey: string }
    ];
    expect(params.dashboard).toBe("full");
    expect(params.identity).toEqual({ country: "ae", entity_type: "company" });
    expect(params.configuration.merchant.capabilities.card_payments.requested).toBe(true);
    expect(params.defaults.responsibilities).toEqual({ fees_collector: "stripe", losses_collector: "stripe" });
    expect(params.metadata).toEqual({ whatsorder_restaurant_id: restaurantId });
    expect(options.idempotencyKey).toBe(`whatsorder-connect-test-${restaurantId}`);
    expect(writes[0].payload).toMatchObject({
      restaurant_id: restaurantId,
      stripe_account_id: "acct_1TestAAAAAAAAAAA",
      livemode: false,
      card_payments_status: "restricted",
      requirements_due: true,
      created_by_user_id: "user-1"
    });
    expect(saved.stripe_account_id).toBe("acct_1TestAAAAAAAAAAA");
  });

  it("reuses an existing account instead of creating another", async () => {
    mockTable({ restaurant_id: restaurantId, stripe_account_id: "acct_1ExistingAAAAAA", livemode: false, card_payments_status: "active", requirements_due: false, status_checked_at: null });
    const stripe = mockStripe(restrictedAccount);
    const saved = await connectRestaurantAccount({ restaurantId, restaurantName: "Chai", contactEmail: null, userId: "u" });
    expect(saved.stripe_account_id).toBe("acct_1ExistingAAAAAA");
    expect(stripe.v2.core.accounts.create).not.toHaveBeenCalled();
  });

  it("ignores a test-mode account when running with live keys", async () => {
    mockTable({ restaurant_id: restaurantId, stripe_account_id: "acct_1TestAAAAAAAAAAA", livemode: false, card_payments_status: "active", requirements_due: false, status_checked_at: null });
    vi.mocked(isStripeLiveMode).mockReturnValue(true);
    expect(await getRestaurantStripeAccount(restaurantId)).toBeNull();
  });

  it("syncs the capability status from Stripe, scoped to the restaurant's own account", async () => {
    const writes = mockTable({ restaurant_id: restaurantId, stripe_account_id: "acct_1TestAAAAAAAAAAA", livemode: false, card_payments_status: "pending", requirements_due: true, status_checked_at: null });
    mockStripe({ ...restrictedAccount, configuration: { merchant: { capabilities: { card_payments: { status: "active" } } } }, requirements: { summary: { minimum_deadline: null } } });
    const synced = await syncRestaurantStripeAccount(restaurantId);
    expect(synced?.card_payments_status).toBe("active");
    expect(synced?.requirements_due).toBe(false);
    expect(writes.find((w) => w.op === "update")?.filters).toEqual([
      ["restaurant_id", restaurantId],
      ["stripe_account_id", "acct_1TestAAAAAAAAAAA"]
    ]);
  });

  it("issues onboarding sessions only for the restaurant's own account", async () => {
    mockTable({ restaurant_id: restaurantId, stripe_account_id: "acct_1TestAAAAAAAAAAA", livemode: false, card_payments_status: "pending", requirements_due: true, status_checked_at: null });
    const stripe = mockStripe(restrictedAccount);
    expect(await createOnboardingClientSecret(restaurantId)).toBe("accs_secret_test");
    expect(stripe.accountSessions.create).toHaveBeenCalledWith({
      account: "acct_1TestAAAAAAAAAAA",
      components: { account_onboarding: { enabled: true }, notification_banner: { enabled: true } }
    });

    mockTable(null);
    await expect(createOnboardingClientSecret(restaurantId)).rejects.toBeInstanceOf(StripeConnectError);
  });

  it("reports Stripe as not configured without a secret key", async () => {
    mockTable(null);
    vi.mocked(getStripe).mockReturnValue(null);
    await expect(
      connectRestaurantAccount({ restaurantId, restaurantName: "Chai", contactEmail: null, userId: "u" })
    ).rejects.toMatchObject({ code: "not_configured" });
  });
});
