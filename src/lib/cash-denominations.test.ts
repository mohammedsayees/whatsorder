import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cashDenominations, parseCashDenominations } from "@/lib/cash-denominations";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261121150000_cash_count_denominations.sql"),
  "utf8"
);
const json = (rows: unknown) => JSON.stringify(rows);

describe("parseCashDenominations", () => {
  it("treats a missing or empty breakdown as none", () => {
    expect(parseCashDenominations(null, "AED", 100)).toEqual({ denominations: null });
    expect(parseCashDenominations("", "AED", 100)).toEqual({ denominations: null });
    expect(parseCashDenominations("[]", "AED", 100)).toEqual({ denominations: null });
    expect(parseCashDenominations(json([{ minor: 50000, count: 0 }]), "AED", 0))
      .toEqual({ denominations: null });
  });

  it("accepts a breakdown that adds up exactly, including fils coins", () => {
    // 2 × 500 + 3 × 20 + 1 × 0.50 + 3 × 0.25 = 1061.25
    const result = parseCashDenominations(json([
      { minor: 25, count: 3 },
      { minor: 2000, count: 3 },
      { minor: 50000, count: 2 },
      { minor: 50, count: 1 },
      { minor: 100, count: 0 }
    ]), "AED", 1061.25);
    expect(result.error).toBeUndefined();
    expect(result.denominations).toEqual([
      { minor: 50000, count: 2 },
      { minor: 2000, count: 3 },
      { minor: 50, count: 1 },
      { minor: 25, count: 3 }
    ]);
  });

  it("rejects totals that don't match, unknown notes, fractions and duplicates", () => {
    expect(parseCashDenominations(json([{ minor: 50000, count: 2 }]), "AED", 999).error)
      .toMatch(/don't add up/);
    expect(parseCashDenominations(json([{ minor: 30000, count: 1 }]), "AED", 300).error)
      .toBeDefined();
    expect(parseCashDenominations(json([{ minor: 25, count: 1 }]), "INR", 0.25).error)
      .toBeDefined();
    expect(parseCashDenominations(json([{ minor: 1000, count: 1.5 }]), "AED", 15).error)
      .toBeDefined();
    expect(parseCashDenominations(json([{ minor: 1000, count: -1 }]), "AED", -10).error)
      .toBeDefined();
    expect(parseCashDenominations(json([
      { minor: 1000, count: 1 }, { minor: 1000, count: 1 }
    ]), "AED", 20).error).toBeDefined();
    expect(parseCashDenominations("{oops", "AED", 1).error).toBeDefined();
  });

  it("uses the same denomination lists as the database", () => {
    for (const [currency, list] of Object.entries(cashDenominations)) {
      const sqlList = currency === "INR"
        ? sql.match(/when 'INR' then array\[([^\]]+)\]/)?.[1]
        : sql.match(/else array\[([^\]]+)\]/)?.[1];
      expect(sqlList?.split(",").map((value) => Number(value.trim())))
        .toEqual(list.map((denomination) => denomination.minor));
    }
  });

  it("keeps the new functions service-role only", () => {
    for (const fn of [
      "normalize_cash_denominations(uuid, jsonb, numeric)",
      "declare_shift_cash_count(uuid, uuid, numeric, uuid, jsonb)"
    ]) {
      expect(sql).toContain(`revoke all on function public.${fn}\nfrom public, anon, authenticated;`);
    }
    expect(sql).toMatch(/close_restaurant_shift_v4\(\s*uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid, jsonb\s*\) from public, anon, authenticated;/);
  });
});
