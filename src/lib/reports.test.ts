import { describe, expect, it } from "vitest";
import {
  buildRestaurantReport,
  csvCell,
  reportToCsv,
  resolveReportRange
} from "./reports";
import type { Customer, Order } from "./types";

function order(overrides: Partial<Order> = {}) {
  return {
    created_at: "2026-06-20T08:00:00.000Z",
    customer_name: "Aisha",
    customer_phone: "0501234567",
    delivery_fee: 5,
    fulfilment_type: "delivery",
    items: [
      {
        item_id: "burger",
        name: "Burger",
        price: 20,
        quantity: 2
      }
    ],
    loyalty_discount: 0,
    payment_method: "Cash on Delivery",
    status: "Completed",
    total: 45,
    ...overrides
  } as Order;
}

describe("report ranges", () => {
  it("builds UAE calendar ranges with an exclusive end", () => {
    const range = resolveReportRange(
      "last_7_days",
      undefined,
      undefined,
      new Date("2026-06-20T08:00:00.000Z")
    );

    expect(range.startDate).toBe("2026-06-14");
    expect(range.endDate).toBe("2026-06-20");
    expect(range.startIso).toBe("2026-06-14T00:00:00+04:00");
    expect(range.endExclusiveIso).toBe("2026-06-21T00:00:00+04:00");
  });
});

describe("restaurant reporting", () => {
  it("neutralizes spreadsheet formulas in CSV text cells", () => {
    expect(csvCell("=HYPERLINK(\"https://example.com\")")).toBe(
      "\"'=HYPERLINK(\"\"https://example.com\"\")\""
    );
    expect(csvCell("+971501234567")).toBe("'+971501234567");
    expect(csvCell(" @SUM(1,2)")).toBe("\"' @SUM(1,2)\"");
    expect(csvCell(25)).toBe("25");
  });

  it("uses completed orders for revenue and preserves cancelled counts", () => {
    const report = buildRestaurantReport(
      [
        order(),
        order({
          customer_name: "Rahul",
          customer_phone: "0559876543",
          status: "Cancelled",
          total: 100
        })
      ],
      [
        {
          consent_marketing: true,
          marketing_opt_in: true,
          phone: "0501234567"
        } as Customer
      ]
    );

    expect(report.completedOrders).toBe(1);
    expect(report.cancelledOrders).toBe(1);
    expect(report.sales).toBe(45);
    expect(report.productRows[0]).toMatchObject({
      name: "Burger",
      quantity: 2,
      sales: 40
    });
    expect(report.marketingConsentCustomers).toBe(1);
  });

  it("exports product data as CSV", () => {
    const csv = reportToCsv("products", buildRestaurantReport([order()]));

    expect(csv).toContain("Rank,Product,Quantity");
    expect(csv).toContain("Burger");
  });
});
