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

  it("fails closed when an immutable report snapshot is malformed", () => {
    expect(parseShiftCloseReportSnapshot({ report_version: 1 })).toBeNull();
  });
});
