import { describe, expect, it, vi } from "vitest";

const filters: Record<string, unknown[][]> = {};
const tables: Record<string, { data: unknown; error: unknown }> = {};

function chain(table: string) {
  const record = (...args: unknown[]) => {
    (filters[table] ??= []).push(args);
    return builder;
  };
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (...args: unknown[]) => record("eq", ...args),
    neq: (...args: unknown[]) => record("neq", ...args),
    in: (...args: unknown[]) => record("in", ...args),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(tables[table]).then(resolve)
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => chain(table) })
}));

const { getPosterPerformance } = await import("./store");

describe("getPosterPerformance", () => {
  it("counts sent recipients and non-cancelled attributed orders per poster", async () => {
    tables.marketing_sends = {
      data: [{ poster_id: "p1" }, { poster_id: "p1" }, { poster_id: "p2" }],
      error: null
    };
    tables.orders = {
      data: [{ attribution_source: "poster-p1" }, { attribution_source: "poster-p1" }, { attribution_source: "poster-p1" }],
      error: null
    };
    const result = await getPosterPerformance("rest-1", ["p1", "p2", "p3"]);
    expect(result.get("p1")).toEqual({ sentCount: 2, orderCount: 3 });
    expect(result.get("p2")).toEqual({ sentCount: 1, orderCount: 0 });
    expect(result.get("p3")).toEqual({ sentCount: 0, orderCount: 0 });

    expect(filters.marketing_sends).toContainEqual(["eq", "restaurant_id", "rest-1"]);
    expect(filters.marketing_sends).toContainEqual(["eq", "status", "sent"]);
    expect(filters.orders).toContainEqual(["eq", "restaurant_id", "rest-1"]);
    expect(filters.orders).toContainEqual(["neq", "status", "Cancelled"]);
    expect(filters.orders).toContainEqual([
      "in",
      "attribution_source",
      ["poster-p1", "poster-p2", "poster-p3"]
    ]);
  });

  it("shows zeros when a read fails", async () => {
    tables.marketing_sends = { data: null, error: { code: "500" } };
    tables.orders = { data: null, error: { code: "500" } };
    const result = await getPosterPerformance("rest-1", ["p1"]);
    expect(result.get("p1")).toEqual({ sentCount: 0, orderCount: 0 });
  });
});
