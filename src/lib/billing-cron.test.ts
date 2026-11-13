import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal in-memory stand-in for the service-role client: enough of the
// PostgREST builder for runDailyBilling's queries.
type Row = Record<string, unknown>;
const db: { subscriptions: Row[]; invoices: Row[]; plans: Row[] } = {
  subscriptions: [],
  invoices: [],
  plans: []
};
let failIssueFor = new Set<string>();
const issued: Row[] = [];

function query(table: keyof typeof db | "subscription_status_events") {
  const filters: Array<(row: Row) => boolean> = [];
  let patch: Row | null = null;
  const rows = () =>
    table === "subscription_status_events" ? [] : db[table].filter((r) => filters.every((f) => f(r)));
  const run = () => {
    if (patch) {
      for (const row of rows()) Object.assign(row, patch);
    }
    return rows();
  };
  const builder: Record<string, unknown> = {
    select: () => builder,
    insert: () => Promise.resolve({ error: null }),
    update: (values: Row) => {
      patch = values;
      return builder;
    },
    eq: (col: string, value: unknown) => (filters.push((r) => r[col] === value), builder),
    neq: (col: string, value: unknown) => (filters.push((r) => r[col] !== value), builder),
    in: (col: string, values: unknown[]) => (filters.push((r) => values.includes(r[col])), builder),
    lt: (col: string, value: string) => (filters.push((r) => r[col] != null && String(r[col]) < value), builder),
    lte: (col: string, value: string) => (filters.push((r) => r[col] != null && String(r[col]) <= value), builder),
    not: (col: string) => (filters.push((r) => r[col] != null), builder),
    maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
    single: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => resolve({ data: run(), error: null })
  };
  return builder;
}

const admin = {
  from: (table: keyof typeof db) => query(table),
  rpc: (_name: string, args: Row) => {
    if (failIssueFor.has(String(args.p_subscription_id))) {
      return Promise.resolve({ data: null, error: { message: "transient" } });
    }
    const invoice = {
      id: `inv-${issued.length + 1}`,
      idempotency_key: args.p_idempotency_key,
      status: "draft",
      ...args
    };
    issued.push(invoice);
    db.invoices.push(invoice);
    return Promise.resolve({ data: invoice, error: null });
  }
};

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => admin }));

const { runDailyBilling } = await import("./billing-data");

function subscription(overrides: Row): Row {
  return {
    restaurant_id: `rest-${String(overrides.id)}`,
    plan_id: "plan-1",
    status: "active",
    billing_interval: "monthly",
    cancel_at_period_end: false,
    trial_ends_at: null,
    price_override: null,
    price_override_ends_at: null,
    grace_until: null,
    ...overrides
  };
}

beforeEach(() => {
  db.plans = [
    { id: "plan-1", name: "Growth", name_ar: null, monthly_price: 100, annual_price: 1000, currency: "AED" }
  ];
  db.invoices = [];
  issued.length = 0;
  failIssueFor = new Set();
});

describe("runDailyBilling renewal", () => {
  it("leaves a subscription due when its invoice fails, and still bills the rest", async () => {
    db.subscriptions = [
      subscription({ id: "a", billing_cycle_start: "2026-10-01", billing_cycle_end: "2026-10-31" }),
      subscription({ id: "b", billing_cycle_start: "2026-10-01", billing_cycle_end: "2026-10-31" })
    ];
    failIssueFor = new Set(["a"]);

    const summary = await runDailyBilling(new Date("2026-11-01T03:00:00Z"));

    expect(summary.failed).toBe(1);
    expect(summary.invoicesIssued).toBe(1);
    expect(db.subscriptions[0].billing_cycle_end).toBe("2026-10-31");
    expect(db.subscriptions[1].billing_cycle_end).toBe("2026-11-30");

    // Next run retries "a" and does not re-bill "b".
    failIssueFor = new Set();
    const retry = await runDailyBilling(new Date("2026-11-02T03:00:00Z"));
    expect(retry.failed).toBe(0);
    expect(retry.invoicesIssued).toBe(1);
    expect(db.subscriptions[0].billing_cycle_end).toBe("2026-11-30");
    expect(issued.map((i) => i.p_subscription_id)).toEqual(["b", "a"]);
  });
});

describe("runDailyBilling yearly trial conversion", () => {
  it("issues the first annual invoice when the trial converts", async () => {
    db.subscriptions = [
      subscription({
        id: "y",
        status: "trialing",
        billing_interval: "yearly",
        trial_ends_at: "2026-11-10T00:00:00.000Z",
        billing_cycle_start: null,
        billing_cycle_end: null
      })
    ];

    const summary = await runDailyBilling(new Date("2026-11-10T03:00:00Z"));

    expect(summary.trialConverted).toBe(1);
    expect(summary.invoicesIssued).toBe(1);
    expect(issued[0]).toMatchObject({
      p_period_start: "2026-11-10",
      p_period_end: "2027-11-09",
      p_line_total: 1000
    });
    expect(db.subscriptions[0]).toMatchObject({
      status: "active",
      billing_cycle_start: "2026-11-10",
      billing_cycle_end: "2027-11-09"
    });
  });

  it("does not activate a yearly trial whose invoice failed", async () => {
    db.subscriptions = [
      subscription({
        id: "y",
        status: "trialing",
        billing_interval: "yearly",
        trial_ends_at: "2026-11-10T00:00:00.000Z",
        billing_cycle_start: null,
        billing_cycle_end: null
      })
    ];
    failIssueFor = new Set(["y"]);

    const summary = await runDailyBilling(new Date("2026-11-10T03:00:00Z"));
    expect(summary.failed).toBe(1);
    expect(db.subscriptions[0].status).toBe("trialing");
  });
});
