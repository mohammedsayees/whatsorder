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

  it("caps custom reports to one year", () => {
    const range = resolveReportRange(
      "custom",
      "2020-01-01",
      "2026-06-20",
      new Date("2026-06-20T08:00:00.000Z")
    );

    expect(range.startDate).toBe("2025-06-20");
    expect(range.endDate).toBe("2026-06-20");
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

describe("order source report", () => {
  it("splits completed sales by source, treating legacy orders as menu-link orders", () => {
    const report = buildRestaurantReport([
      order({ id: "a", source: "whatsapp_chat", total: 30 }),
      order({ id: "b", source: "whatsapp_chat", total: 10 }),
      order({ id: "c", source: "staff", total: 20 }),
      order({ id: "d", total: 40 }),
      order({ id: "e", source: "whatsapp_chat", status: "Cancelled", total: 99 })
    ]);
    expect(report.sourceRows).toEqual([
      { source: "whatsapp_chat", orderCount: 2, amount: 40, averageOrderValue: 20, salesShare: 40 },
      { source: "customer", orderCount: 1, amount: 40, averageOrderValue: 40, salesShare: 40 },
      { source: "staff", orderCount: 1, amount: 20, averageOrderValue: 20, salesShare: 20 }
    ]);
  });

  it("exports the source breakdown as CSV", () => {
    const report = buildRestaurantReport([order({ source: "whatsapp_chat", total: 30 })]);
    expect(reportToCsv("sources", report)).toBe(
      "Order source,Completed orders,Sales,Average order,Sales share %\nWhatsApp chat,1,30.00,30.00,100.00"
    );
  });
});
