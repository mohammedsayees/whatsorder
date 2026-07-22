import { describe, expect, it } from "vitest";
import { renderShiftCloseThermalReport } from "@/lib/shift-report-print";
import type { ShiftCloseReportSnapshot } from "@/lib/types";

const report: ShiftCloseReportSnapshot = {
  schema_version: 1,
  report_version: 1,
  restaurant_id: "restaurant-1",
  restaurant_name: "Chai & Xpress",
  country_code: "AE",
  currency_code: "AED",
  time_zone: "Asia/Dubai",
  shift_id: "00000000-0000-0000-0000-b7d91be5942",
  shift_name: "Morning <shift>",
  opened_at: "2026-07-17T03:09:00.000Z",
  closed_at: "2026-07-17T15:20:00.000Z",
  opened_by_user_id: "user-1",
  closed_by_user_id: "user-1",
  opening_note: null,
  closing_note: null,
  opening_cash_amount: 24.75,
  expected_cash_amount: 32,
  cash_counted_amount: 32,
  cash_difference_amount: 0,
  expected_card_amount: 93.5,
  card_terminal_total: 93.5,
  card_difference_amount: 0,
  expected_upi_amount: 0,
  upi_reported_total: null,
  upi_difference_amount: null,
  completed_order_count: 60,
  completed_sales: 195,
  completed_cash_order_total: 101.5,
  cash_paid_out_total: 94.25,
  cancelled_order_count: 0,
  fulfilment_breakdown: {
    dine_in: { orders: 59, sales: 192 },
    car_pickup: { orders: 1, sales: 3 }
  },
  marketplace_sales: [
    { channel: "talabat", status: "entered", order_count: 1, gross_sales: 35, note: null },
    { channel: "noon", status: "zero", order_count: 0, gross_sales: 0, note: null }
  ],
  marketplace_sales_total: 35,
  combined_operational_sales: 230,
  other_income_total: 0,
  cash_other_income_total: 0,
  card_other_income_total: 0,
  upi_other_income_total: 0,
  bank_other_income_total: 0,
  other_income_breakdown: {},
  combined_operational_receipts: 230,
  report_generated_at: "2026-07-17T15:20:00.000Z",
  correction_reason: null
};

describe("renderShiftCloseThermalReport", () => {
  it("renders a fixed-width, receipt-style balanced shift summary", () => {
    const html = renderShiftCloseThermalReport(report);

    expect(html).toContain("@page { size: 80mm auto; margin: 0; }");
    expect(html).toContain("SHIFT BALANCED — OK");
    expect(html).toContain("Opening cash");
    expect(html).toContain("Cash paid-outs");
    expect(html).toContain("Terminal total");
    expect(html).toContain("Talabat");
    expect(html).toContain("Cancelled in shift window");
    expect(html).toContain("Chai &amp; Xpress");
    expect(html).toContain("Morning &lt;shift&gt;");
    expect(html).not.toContain("<table");
  });

  it("flags differences and unavailable marketplace reports", () => {
    const html = renderShiftCloseThermalReport({
      ...report,
      cash_difference_amount: -5,
      marketplace_sales: [{
        channel: "talabat",
        status: "unavailable",
        order_count: null,
        gross_sales: null,
        note: "Portal offline"
      }]
    });

    expect(html).toContain("*** ACTION REQUIRED ***");
    expect(html).toContain("SHORT");
    expect(html).toContain("UNAVAILABLE");
    expect(html).toContain("Portal offline");
  });
});
