import { describe, expect, it } from "vitest";
import {
  allocatedExpenseForRange,
  buildFinanceOperatingReport,
  monthlyRecurringAccrualFils,
  recurringAccrualForRange
} from "@/lib/finance-report";

describe("finance reporting", () => {
  it("allocates an annual AED 12,000 cost as AED 1,000 per month", () => {
    expect(monthlyRecurringAccrualFils(1_200_000, 12)).toBe(100_000);
    expect(recurringAccrualForRange({
      allocationMonths: 12,
      amountFils: 1_200_000,
      endOn: null,
      frequency: "yearly",
      rangeStart: "2026-02-01",
      rangeEnd: "2026-02-28",
      startOn: "2026-01-01"
    })).toBe(100_000);
  });

  it("allocates service-period expenses without losing fils", () => {
    expect(allocatedExpenseForRange({
      amountFils: 100,
      incurredOn: "2026-01-01",
      rangeStart: "2026-01-02",
      rangeEnd: "2026-01-03",
      serviceStart: "2026-01-01",
      serviceEnd: "2026-01-03"
    })).toBe(66);
  });

  it("excludes purchase spend from operating result and reports incomplete coverage", () => {
    const report = buildFinanceOperatingReport({
      accruedOperatingCostFils: 1000,
      cashOutflowFils: 34_500,
      outputVatRateBps: 500,
      pricesIncludeVat: true,
      purchaseSpendFils: 34_500,
      orders: [{ id: "order", totalFils: 1800, deliveryFeeFils: 0, discountFils: 0, channel: "direct", feeBps: 0, promotionFils: 0 }],
      snapshots: [{ orderId: "order", menuItemId: "item", name: "Tea", quantity: 1, revenueFils: 1800, directCostFils: 400, completeness: "complete" }]
    });
    expect(report.netSalesFils).toBe(1714);
    expect(report.outputVatFils).toBe(86);
    expect(report.estimatedOperatingResultFils).toBe(314);
    expect(report.purchaseSpendFils).toBe(34_500);
  });

  it("never treats an uncosted product as zero-cost profit", () => {
    const report = buildFinanceOperatingReport({
      accruedOperatingCostFils: 0,
      cashOutflowFils: 0,
      outputVatRateBps: 500,
      pricesIncludeVat: true,
      purchaseSpendFils: 0,
      orders: [{ id: "order", totalFils: 1000, deliveryFeeFils: 0, discountFils: 0, channel: "direct", feeBps: 0, promotionFils: 0 }],
      snapshots: [{ orderId: "order", menuItemId: "item", name: "Unknown", quantity: 1, revenueFils: 1000, directCostFils: null, completeness: "missing_recipe" }]
    });
    expect(report.products[0].contributionFils).toBeNull();
    expect(report.estimatedOperatingResultFils).toBeNull();
    expect(report.coveragePct).toBe(0);
  });

  it("allocates discounts and channel fees across products without double counting", () => {
    const report = buildFinanceOperatingReport({
      accruedOperatingCostFils: 0,
      cashOutflowFils: 0,
      outputVatRateBps: 0,
      pricesIncludeVat: false,
      purchaseSpendFils: 0,
      orders: [{ id: "order", totalFils: 900, deliveryFeeFils: 0, discountFils: 100, channel: "talabat", feeBps: 2000, promotionFils: 0 }],
      snapshots: [
        { orderId: "order", menuItemId: "a", name: "A", quantity: 1, revenueFils: 500, directCostFils: 100, completeness: "complete" },
        { orderId: "order", menuItemId: "b", name: "B", quantity: 1, revenueFils: 500, directCostFils: 200, completeness: "complete" }
      ]
    });
    expect(report.products.map((product) => product.netRevenueFils)).toEqual([450, 450]);
    expect(report.channelFeesFils).toBe(180);
    expect(report.products.reduce((sum, product) => sum + product.channelFeesFils, 0)).toBe(180);
  });
});
