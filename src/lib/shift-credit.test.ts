import { describe, expect, it } from "vitest";
import { creditCollected, hasCreditActivity, salesByPayment } from "@/lib/shift-credit";
import type { ShiftCloseReportSnapshot } from "@/lib/types";

// Sales 100 = cash 50 + card 20 + credit 25 + 5 not recorded.
// Card receipts 32 include 12 card other income (8 of it a credit repayment).
const base = {
  country_code: "AE",
  completed_sales: 100,
  completed_cash_order_total: 50,
  expected_card_amount: 32,
  card_other_income_total: 12,
  expected_upi_amount: 0,
  upi_other_income_total: 0,
  credit_repayment_total: 14,
  other_income_entries: null,
  credit_sales: null
} as unknown as ShiftCloseReportSnapshot;

const repayment = (amount: number, method: string, voided = false) => ({
  id: `${method}-${amount}`, category: "customer_credit_repayment", payment_method: method,
  amount, description: "Customer credit repayment", reference: null, customer_id: "c1",
  recorded_at: "2026-11-18T05:00:00Z", voided_at: voided ? "2026-11-18T06:00:00Z" : null,
  void_reason: voided ? "x" : null
});

describe("salesByPayment", () => {
  it("adds up to completed sales on older versions, with credit not separated", () => {
    expect(salesByPayment(base)).toEqual({ cash: 50, card: 20, upi: 0, credit: null, remainder: 30 });
  });

  it("separates credit sales when the version records them", () => {
    const report = {
      ...base,
      credit_sales: [
        { order_id: "o1", customer_id: "c1", amount: 15, due_date: "2026-11-25", completed_at: "x" },
        { order_id: "o2", customer_id: "c2", amount: 10, due_date: null, completed_at: "x" }
      ]
    } as ShiftCloseReportSnapshot;
    expect(salesByPayment(report)).toEqual({ cash: 50, card: 20, upi: 0, credit: 25, remainder: 5 });
  });

  it("counts UPI only for India and drops sub-fils remainders", () => {
    const report = {
      ...base, country_code: "IN", completed_sales: 90.001, expected_upi_amount: 20,
      upi_other_income_total: 0, credit_sales: []
    } as unknown as ShiftCloseReportSnapshot;
    expect(salesByPayment(report)).toMatchObject({ upi: 20, credit: 0, remainder: 0 });
  });
});

describe("creditCollected", () => {
  it("uses the recorded total on older versions", () => {
    expect(creditCollected(base)).toEqual({ total: 14, byMethod: {} });
  });

  it("splits repayments by method and ignores voided and non-credit entries", () => {
    const report = {
      ...base,
      other_income_entries: [
        repayment(6, "cash"), repayment(8, "card"), repayment(2, "cash"),
        repayment(50, "cash", true),
        { ...repayment(30, "cash"), category: "used_oil_sale" }
      ]
    } as ShiftCloseReportSnapshot;
    expect(creditCollected(report)).toEqual({ total: 16, byMethod: { cash: 8, card: 8 } });
    expect(hasCreditActivity(report)).toBe(true);
  });

  it("reports no activity when nothing was sold on credit or collected", () => {
    expect(hasCreditActivity({ ...base, credit_repayment_total: 0, credit_sales: [] } as ShiftCloseReportSnapshot))
      .toBe(false);
  });
});
