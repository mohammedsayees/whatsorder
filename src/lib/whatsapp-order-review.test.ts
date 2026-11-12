import { describe, expect, it, vi } from "vitest";
import { describeParse, parseOutcomeView, parseReviewRange } from "./whatsapp-order-review";

const calls: Array<{ method: string; args: unknown[] }> = [];
vi.mock("server-only", () => ({}));
vi.mock("@/lib/data", () => ({
  getMenu: async () => ({ categories: [], items: [{ id: "tea", name: "Karak" }] }),
  getMenuOptionCatalog: async () => ({ groups: [], options: [{ id: "large", name: "Large" }], links: [] })
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      calls.push({ method: "from", args: [table] });
      let head = false;
      const query: Record<string, unknown> = {};
      for (const method of ["eq", "gte", "or", "in", "order", "range"]) {
        query[method] = (...args: unknown[]) => { calls.push({ method, args }); return query; };
      }
      query.select = (_columns: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return query; };
      query.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(head ? { count: 2, error: null } : { data: [{ id: 1 }], count: 1, error: null }).then(resolve);
      return query;
    }
  })
}));
import { getChatParseReview, VISIBLE_ROWS_FILTER } from "./whatsapp-order-review-data";

const names = { items: new Map([["tea", "Karak"], ["smash", "Smash Burger"]]), options: new Map([["large", "Large"]]) };

describe("describeParse", () => {
  it("describes Gemini and deterministic results with current menu names", () => {
    expect(describeParse({ raw: {}, result: { kind: "add", lines: [
      { item_id: "tea", candidates: [], query: "karak", quantity: 2, option_ids: ["large"], note: "less sugar" },
      { item_id: null, candidates: ["tea", "smash"], query: "x", quantity: 1, option_ids: [], note: "" }
    ] } }, names)).toBe("2 × Karak (Large) — less sugar; 1 × one of Karak / Smash Burger");
    expect(describeParse({ kind: "remove", item_ids: ["smash"] }, names)).toBe("Remove Smash Burger");
  });

  it("shows removed menu items instead of trusting stale ids", () => {
    expect(describeParse({ kind: "add", lines: [{ item_id: "gone", candidates: [], query: "", quantity: 1, option_ids: ["gone-option"], note: "" }] }, names))
      .toBe("1 × removed item");
  });

  it("handles misses, non-orders and malformed rows", () => {
    expect(describeParse({ kind: "unmatched", queries: ["shawarma"] }, names)).toBe("Not on the menu: shawarma");
    expect(describeParse({ raw: null, result: { kind: "not_order" } }, names)).toBe("Passed to the receptionist");
    expect(describeParse(null, names)).toBe("—");
    expect(describeParse({ something: "else" }, names)).toBe("—");
  });
});

describe("outcome labels", () => {
  it("separates real problems from non-orders", () => {
    expect(parseOutcomeView({ outcome: "rejected", reason: "not an order" })).toMatchObject({ label: "Not an order", problem: false });
    expect(parseOutcomeView({ outcome: "rejected", reason: "unmatched item" })).toMatchObject({ label: "Not understood", problem: true });
    expect(parseOutcomeView({ outcome: "error", reason: "http 500" })).toMatchObject({ label: "AI error", problem: true });
    expect(parseOutcomeView({ outcome: "clarify", reason: null }).problem).toBe(false);
  });

  it("accepts only the offered periods", () => {
    expect(parseReviewRange("30")).toBe(30);
    expect(parseReviewRange("365")).toBe(7);
    expect(parseReviewRange(undefined)).toBe(7);
  });
});

describe("getChatParseReview", () => {
  it("scopes every query to the restaurant and hides superseded matcher rows", async () => {
    calls.length = 0;
    const review = await getChatParseReview("restaurant-1", { days: 7, problemsOnly: true, page: 2 });
    const froms = calls.filter(c => c.method === "from");
    const scopes = calls.filter(c => c.method === "eq" && c.args[0] === "restaurant_id");
    expect(froms).toHaveLength(5);
    expect(scopes).toHaveLength(5);
    expect(scopes.every(c => c.args[1] === "restaurant-1")).toBe(true);
    expect(calls.filter(c => c.method === "or").every(c => c.args[0] === VISIBLE_ROWS_FILTER)).toBe(true);
    expect(VISIBLE_ROWS_FILTER).toBe("parser.eq.gemini,reason.is.null,reason.not.like.unmatched*");
    expect(calls).toContainEqual({ method: "in", args: ["outcome", ["rejected", "error"]] });
    expect(calls).toContainEqual({ method: "range", args: [50, 99] });
    expect(review.counts).toEqual({ accepted: 2, clarify: 2, rejected: 2, error: 2 });
    expect(review.names.items.get("tea")).toBe("Karak");
  });
});
