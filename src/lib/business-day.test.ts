import { describe, expect, it } from "vitest";
import { parseBusinessDayCloseReportSnapshot } from "@/lib/business-day";

const snapshot = {
  schema_version: 1,
  report_version: 1,
  business_day_id: "day-1",
  business_date: "2026-07-22",
  restaurant_id: "restaurant-1",
  restaurant_name: "Chai Xpress",
  country_code: "IN",
  currency_code: "INR",
  time_zone: "Asia/Kolkata",
  opened_at: "2026-07-22T00:30:00Z",
  closed_at: "2026-07-22T19:30:00Z",
  report_generated_at: "2026-07-22T19:31:00Z",
  shift_count: 2,
  completed_order_count: 30,
  cancelled_order_count: 1,
  whatsorder_sales: 1000,
  marketplace_sales: 200,
  combined_operational_sales: 1200,
  other_income_total: 100,
  cash_other_income_total: 100,
  card_other_income_total: 0,
  upi_other_income_total: 0,
  bank_other_income_total: 0,
  total_operational_receipts: 1300,
  cash_order_sales: 500,
  card_order_sales: 300,
  upi_order_sales: 200,
  cash_paid_out_total: 50,
  net_cash_movement: 550,
  cash_difference_total: -10,
  card_difference_total: 0,
  upi_difference_total: 0,
  final_cash_counted: 740,
  shifts: [{
    id: "shift-1",
    name: "Morning",
    opened_at: "2026-07-22T00:30:00Z",
    closed_at: "2026-07-22T09:30:00Z",
    completed_orders: 30,
    sales: 1000,
    marketplace_sales: 200,
    other_income: 100,
    cash_paid_outs: 50,
    opening_cash: 200,
    expected_cash: 750,
    cash_counted: 740,
    cash_difference: -10,
    report_version: 1
  }],
  other_income_breakdown: { used_oil_sale: 100 }
};

describe("business day close snapshots", () => {
  it("accepts a valid immutable combined report", () => {
    expect(parseBusinessDayCloseReportSnapshot(snapshot)).toMatchObject({
      business_date: "2026-07-22",
      shift_count: 2,
      total_operational_receipts: 1300
    });
  });

  it("rejects incomplete shift facts", () => {
    const invalid = structuredClone(snapshot);
    delete (invalid.shifts[0] as Partial<(typeof invalid.shifts)[number]>).cash_difference;
    expect(parseBusinessDayCloseReportSnapshot(invalid)).toBeNull();
  });
});
