import { describe, expect, it } from "vitest";
import {
  breakdownWithoutUnbilled,
  cashSalesSplit,
  otherIncomeExcludingUnbilled,
  unbilledFromEntries,
  unbilledFromReport
} from "@/lib/unbilled-sales";

const entry = (category: string, method: string, amount: number, voided = false) => ({
  category, payment_method: method, amount, voided_at: voided ? "2026-11-18T06:00:00Z" : null
});

describe("unbilled sales", () => {
  it("totals non-voided unbilled sales by payment method", () => {
    expect(unbilledFromEntries([
      entry("unbilled_sale", "cash", 12), entry("unbilled_sale", "card", 8),
      entry("unbilled_sale", "cash", 0.25), entry("unbilled_sale", "cash", 50, true),
      entry("used_oil_sale", "cash", 5)
    ])).toEqual({ total: 20.25, byMethod: { cash: 12.25, card: 8 } });
  });

  it("falls back to the breakdown total on reports without itemized entries", () => {
    expect(unbilledFromReport({ other_income_entries: null, other_income_breakdown: { unbilled_sale: 20, other: 5 } }))
      .toEqual({ total: 20, byMethod: {} });
    expect(unbilledFromReport({ other_income_entries: null, other_income_breakdown: {} }).total).toBe(0);
  });

  it("takes unbilled sales out of other income and its breakdown", () => {
    const unbilled = { total: 20, byMethod: { cash: 12, card: 8 } };
    expect(otherIncomeExcludingUnbilled({
      other_income_total: 25, cash_other_income_total: 17, card_other_income_total: 8, upi_other_income_total: 0
    }, unbilled)).toEqual({ total: 5, cash: 5, card: 0, upi: 0 });
    expect(breakdownWithoutUnbilled({ unbilled_sale: 20, used_oil_sale: 5 })).toEqual({ used_oil_sale: 5 });
  });

  it("adds cash unbilled sales to billed cash for total cash sales", () => {
    // Chai Xpress 21 Nov: 34.50 + 340.50 billed, 10 + 26 unbilled cash.
    expect(cashSalesSplit(375, { total: 114, byMethod: { cash: 36, card: 78 } }))
      .toEqual({ billed: 375, unbilled: 36, total: 411 });
    expect(cashSalesSplit(34.5, { total: 0, byMethod: {} }))
      .toEqual({ billed: 34.5, unbilled: 0, total: 34.5 });
  });
});
