import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DailyNumbers } from "./types";

const hoisted = vi.hoisted(() => ({
  admin: null as unknown,
  numbersById: {} as Record<string, DailyNumbers | "throw">
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => hoisted.admin
}));

vi.mock("./metrics", () => ({
  computeDailyNumbers: (_admin: unknown, id: string) => {
    const value = hoisted.numbersById[id];
    if (value === "throw") {
      return Promise.reject(new Error("compute failed"));
    }
    return Promise.resolve(value);
  }
}));

vi.mock("./narrate", () => ({
  narrate: () => Promise.resolve("MESSAGE")
}));

vi.mock("./send", () => ({
  sendOwnerMessage: () => Promise.resolve({ delivered: false, reason: "no_outbound_channel" })
}));

import { dubaiDateString, runDailySummary } from "./run";

type Store = {
  restaurants: Array<{
    id: string;
    name: string;
    owner_phone: string | null;
    daily_summary_phone: string | null;
  }>;
  existing: Record<string, { status: string } | null>;
  upserts: Array<Record<string, unknown>>;
  restaurantFilters: Record<string, unknown>;
};

function makeAdmin(store: Store) {
  function build(table: string) {
    const state: { filters: Record<string, unknown>; op: string; single: boolean; payload?: Record<string, unknown> } = {
      filters: {},
      op: "select",
      single: false
    };

    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      limit: () => builder,
      eq: (col: string, val: unknown) => {
        state.filters[col] = val;
        if (table === "restaurants") {
          store.restaurantFilters[col] = val;
        }
        return builder;
      },
      maybeSingle: () => {
        state.single = true;
        return builder;
      },
      upsert: (payload: Record<string, unknown>) => {
        state.op = "upsert";
        state.payload = payload;
        return builder;
      },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(resolveResult()).then(resolve, reject)
    };

    function resolveResult() {
      if (state.op === "upsert") {
        store.upserts.push(state.payload as Record<string, unknown>);
        return { error: null };
      }
      if (table === "restaurants") {
        return { data: store.restaurants, error: null };
      }
      if (table === "daily_summary_runs" && state.single) {
        const key = `${state.filters.restaurant_id}|${state.filters.summary_date}`;
        return { data: store.existing[key] ?? null, error: null };
      }
      return { data: null, error: null };
    }

    return builder;
  }

  return { from: (table: string) => build(table) };
}

function numbers(overrides: Partial<DailyNumbers> = {}): DailyNumbers {
  return {
    summary_date: "2026-06-25",
    order_count: 5,
    gross_revenue: 100,
    avg_order_value: 20,
    prev_count: 4,
    last_week_count: 0,
    delta_vs_prev: 1,
    delta_vs_last_week: 5,
    dow_avg_count: 4,
    cancelled_count: 0,
    contact_capture_rate: 0.2,
    marketable_count: 1,
    top_item: { name: "Karak Tea", qty: 3 },
    top_combo: null,
    item_riser: null,
    item_faller: null,
    aov_this_week: 20,
    aov_prev_week: 20,
    busiest_hour: 18,
    deadest_hour: 6,
    ...overrides
  };
}

function emptyStore(): Store {
  return { restaurants: [], existing: {}, upserts: [], restaurantFilters: {} };
}

describe("dubaiDateString", () => {
  it("returns yesterday's Dubai date for a 07:00 GST run", () => {
    // 03:00 UTC == 07:00 Asia/Dubai on 2026-06-27.
    const now = new Date("2026-06-27T03:00:00.000Z");
    expect(dubaiDateString(now, -1)).toBe("2026-06-26");
  });

  it("respects the +4 offset across a UTC day boundary", () => {
    // 20:30 UTC is already 00:30 the next day in Dubai.
    const now = new Date("2026-06-26T20:30:00.000Z");
    expect(dubaiDateString(now, -1)).toBe("2026-06-26");
  });
});

describe("runDailySummary", () => {
  beforeEach(() => {
    hoisted.numbersById = {};
  });

  it("filters to active, opted-in restaurants", async () => {
    const store = emptyStore();
    hoisted.admin = makeAdmin(store);

    await runDailySummary({ targetDay: "2026-06-25" });

    expect(store.restaurantFilters.is_active).toBe(true);
    expect(store.restaurantFilters.daily_summary_enabled).toBe(true);
  });

  it("records a normal day and skips one already done (idempotency)", async () => {
    const store = emptyStore();
    store.restaurants = [
      { id: "r1", name: "A", owner_phone: "111", daily_summary_phone: null },
      { id: "r2", name: "B", owner_phone: "222", daily_summary_phone: null }
    ];
    store.existing["r1|2026-06-25"] = { status: "sent" };
    hoisted.numbersById = { r2: numbers({ order_count: 5 }) };
    hoisted.admin = makeAdmin(store);

    const result = await runDailySummary({ targetDay: "2026-06-25" });

    expect(result).toMatchObject({ processed: 2, already_done: 1, sent: 1, failed: 0 });
    expect(store.upserts).toHaveLength(1);
    expect(store.upserts[0]).toMatchObject({ restaurant_id: "r2", status: "sent" });
  });

  it("records a zero-order day as skipped_empty (still produces a message)", async () => {
    const store = emptyStore();
    store.restaurants = [{ id: "r1", name: "A", owner_phone: "111", daily_summary_phone: null }];
    hoisted.numbersById = { r1: numbers({ order_count: 0 }) };
    hoisted.admin = makeAdmin(store);

    const result = await runDailySummary({ targetDay: "2026-06-25" });

    expect(result).toMatchObject({ skipped_empty: 1, sent: 0 });
    expect(store.upserts[0]).toMatchObject({ status: "skipped_empty", message_text: "MESSAGE" });
  });

  it("isolates a per-restaurant failure and continues the batch", async () => {
    const store = emptyStore();
    store.restaurants = [
      { id: "r1", name: "A", owner_phone: "111", daily_summary_phone: null },
      { id: "r2", name: "B", owner_phone: "222", daily_summary_phone: null }
    ];
    hoisted.numbersById = { r1: "throw", r2: numbers({ order_count: 5 }) };
    hoisted.admin = makeAdmin(store);

    const result = await runDailySummary({ targetDay: "2026-06-25" });

    expect(result).toMatchObject({ processed: 2, failed: 1, sent: 1 });
    const failedRow = store.upserts.find((row) => row.status === "failed");
    expect(failedRow).toMatchObject({ restaurant_id: "r1" });
    expect(failedRow?.error).toContain("compute failed");
  });

  it("retries a previously failed run", async () => {
    const store = emptyStore();
    store.restaurants = [{ id: "r1", name: "A", owner_phone: "111", daily_summary_phone: null }];
    store.existing["r1|2026-06-25"] = { status: "failed" };
    hoisted.numbersById = { r1: numbers({ order_count: 5 }) };
    hoisted.admin = makeAdmin(store);

    const result = await runDailySummary({ targetDay: "2026-06-25" });

    expect(result).toMatchObject({ already_done: 0, sent: 1 });
    expect(store.upserts[0]).toMatchObject({ restaurant_id: "r1", status: "sent" });
  });
});
