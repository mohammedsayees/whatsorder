import { describe, expect, it } from "vitest";
import {
  configuredMarketplaceChannels,
  marketplaceSalesFromFormData,
  parseShiftCloseReportSnapshot,
  reconciliationNeedsNote
} from "@/lib/shift-reconciliation";

describe("shift reconciliation", () => {
  it("keeps only unique supported marketplace channels", () => {
    expect(configuredMarketplaceChannels([
      "talabat",
      "unknown",
      "talabat",
      "deliveroo"
    ])).toEqual(["talabat", "deliveroo"]);
  });

  it("normalizes entered, zero and unavailable platform reports", () => {
    const formData = new FormData();
    formData.set("marketplace_talabat_status", "entered");
    formData.set("marketplace_talabat_order_count", "3");
    formData.set("marketplace_talabat_gross_sales", "75.50");
    formData.set("marketplace_noon_status", "zero");
    formData.set("marketplace_deliveroo_status", "unavailable");
    formData.set("marketplace_deliveroo_note", "Portal offline");

    expect(marketplaceSalesFromFormData(
      formData,
      ["talabat", "noon", "deliveroo"]
    )).toEqual({
      entries: [
        {
          channel: "talabat",
          status: "entered",
          order_count: 3,
          gross_sales: 75.5,
          note: null
        },
        {
          channel: "noon",
          status: "zero",
          order_count: 0,
          gross_sales: 0,
          note: null
        },
        {
          channel: "deliveroo",
          status: "unavailable",
          order_count: null,
          gross_sales: null,
          note: "Portal offline"
        }
      ]
    });
  });

  it("rejects an unconfirmed or invalid marketplace report", () => {
    const missing = new FormData();
    expect(marketplaceSalesFromFormData(missing, ["talabat"]).error)
      .toBe("Confirm the Talabat total.");

    const invalid = new FormData();
    invalid.set("marketplace_talabat_status", "entered");
    invalid.set("marketplace_talabat_gross_sales", "-1");
    expect(marketplaceSalesFromFormData(invalid, ["talabat"]).error)
      .toContain("valid Talabat sales total");
  });

  it("requires a note for material cash, card or UPI differences", () => {
    expect(reconciliationNeedsNote([0, 0, null])).toBe(false);
    expect(reconciliationNeedsNote([0, -0.01, null])).toBe(true);
  });

  it("excludes credit repayments from total receipts, including reports saved before the fix", () => {
    const parsed = parseShiftCloseReportSnapshot({
      schema_version: 1, report_version: 1,
      restaurant_id: "r", restaurant_name: "R", country_code: "AE",
      currency_code: "AED", time_zone: "Asia/Dubai",
      shift_id: "s", shift_name: "Morning",
      opened_at: "2026-11-10T04:00:00Z", closed_at: "2026-11-10T12:00:00Z",
      opened_by_user_id: "u", closed_by_user_id: "u",
      opening_note: null, closing_note: null,
      opening_cash_amount: 50, expected_cash_amount: 80, cash_counted_amount: 80,
      cash_difference_amount: 0, expected_card_amount: 20, card_terminal_total: 20,
      card_difference_amount: 0, expected_upi_amount: 0,
      upi_reported_total: null, upi_difference_amount: null,
      completed_order_count: 2, completed_sales: 30, completed_cash_order_total: 10,
      cash_paid_out_total: 0, cancelled_order_count: 0, fulfilment_breakdown: {},
      marketplace_sales: [], marketplace_sales_total: 0, combined_operational_sales: 30,
      other_income_total: 20, cash_other_income_total: 20,
      other_income_breakdown: { used_oil_sale: 5, customer_credit_repayment: 15 },
      // Stale value saved before the fix: 30 + 20, counting the repayment twice.
      combined_operational_receipts: 50,
      report_generated_at: "2026-11-10T12:00:00Z", correction_reason: null
    });
    expect(parsed).toMatchObject({
      credit_repayment_total: 15,
      combined_operational_receipts: 35
    });
  });

  it("fails closed when an immutable report snapshot is malformed", () => {
    expect(parseShiftCloseReportSnapshot({ report_version: 1 })).toBeNull();
  });
});
