import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { blindSummary, isCashCountBlind } from "@/lib/shift-data";
import type { ShiftSummary } from "@/lib/types";
import type { RestaurantAdminSession } from "@/lib/super-admin-auth";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261121120000_blind_cash_count.sql"),
  "utf8"
);

function session(role: string, blind?: boolean) {
  return {
    role,
    restaurant: blind === undefined ? {} : { blind_cash_count: blind }
  } as unknown as Pick<RestaurantAdminSession, "role" | "restaurant">;
}

describe("blind cash count", () => {
  it("blinds only staff, by default, until a count is locked", () => {
    expect(isCashCountBlind(session("staff"), false)).toBe(true);
    expect(isCashCountBlind(session("staff", true), false)).toBe(true);
    expect(isCashCountBlind(session("staff", true), true)).toBe(false);
    expect(isCashCountBlind(session("staff", false), false)).toBe(false);
    expect(isCashCountBlind(session("manager", true), false)).toBe(false);
    expect(isCashCountBlind(session("owner", true), false)).toBe(false);
  });

  it("removes every figure expected cash could be worked out from", () => {
    const summary = {
      completed_cash_order_total: 120,
      completed_sales: 300,
      expected_cash_amount: 220,
      fulfilment_breakdown: { takeaway: { orders: 3, sales: 300 } },
      card_on_delivery_total: 180,
      completed_order_count: 3
    } as unknown as ShiftSummary;
    const blind = blindSummary(summary);
    expect(blind.completed_cash_order_total).toBe(0);
    expect(blind.completed_sales).toBe(0);
    expect(blind.expected_cash_amount).toBe(0);
    expect(blind.fulfilment_breakdown).toEqual({});
    // Card is not blind-counted; it still reconciles against the terminal.
    expect(blind.card_on_delivery_total).toBe(180);
  });

  it("locks the count once, and the close must use it", () => {
    expect(sql).toContain("add column if not exists blind_cash_count boolean not null default true");
    expect(sql).toContain("'The cash count for this shift is already locked'");
    expect(sql).toContain("<> shift_row.declared_cash_counted_amount");
    expect(sql).toContain("if blind and actor_role = 'staff' then");
    expect(sql).toContain("return public.close_restaurant_shift_v3(");
    expect(sql).toMatch(
      /revoke all on function public\.close_restaurant_shift_v4\([^)]*\)\s+from public, anon, authenticated;/
    );
  });
});
