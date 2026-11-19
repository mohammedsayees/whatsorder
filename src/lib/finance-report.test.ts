import { describe, expect, it } from "vitest";
import {
  allocatedExpenseForRange,
  buildFinanceOperatingReport,
  expenseCashPaidFils,
  expensePeriodFilter,
  recurringEffectiveEnd,
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

  it("charges channel commission on food value, not the delivery fee", () => {
    const report = buildFinanceOperatingReport({
      accruedOperatingCostFils: 0,
      cashOutflowFils: 0,
      outputVatRateBps: 0,
      pricesIncludeVat: false,
      purchaseSpendFils: 0,
      orders: [{ id: "order", totalFils: 1200, deliveryFeeFils: 200, discountFils: 0, channel: "talabat", feeBps: 2000, promotionFils: 50 }],
      snapshots: [{ orderId: "order", menuItemId: "a", name: "A", quantity: 1, revenueFils: 1000, directCostFils: 100, completeness: "complete" }]
    });
    expect(report.channelFeesFils).toBe(250);
    expect(report.deliveryFeesFils).toBe(200);
  });

  it("counts only the amount actually paid for partial payments", () => {
    expect(expenseCashPaidFils({ paymentStatus: "partial", paidAmountFils: 3000, totalFils: 5000 })).toBe(3000);
    expect(expenseCashPaidFils({ paymentStatus: "paid", paidAmountFils: null, totalFils: 5000 })).toBe(5000);
    // Older partial rows without an amount keep the previous behaviour.
    expect(expenseCashPaidFils({ paymentStatus: "partial", paidAmountFils: null, totalFils: 5000 })).toBe(5000);
  });

  it("stops a paused schedule the day before it paused, so past periods keep it", () => {
    expect(recurringEffectiveEnd(null, "2026-11-10")).toBe("2026-11-09");
    expect(recurringEffectiveEnd("2026-11-05", "2026-11-10")).toBe("2026-11-05");
    expect(recurringEffectiveEnd("2026-12-31", null)).toBe("2026-12-31");
    // Rent paused on 10 Nov still counts in full for October.
    expect(recurringAccrualForRange({
      allocationMonths: 1, amountFils: 3_000_000,
      endOn: recurringEffectiveEnd(null, "2026-11-10"), frequency: "monthly",
      rangeStart: "2026-10-01", rangeEnd: "2026-10-31", startOn: "2026-01-01"
    })).toBe(3_000_000);
  });

  it("loads only expenses that can affect the period", () => {
    const filter = expensePeriodFilter("2026-10-01", "2026-10-31");
    expect(filter).toContain("and(incurred_on.gte.2026-10-01,incurred_on.lte.2026-10-31)");
    expect(filter).toContain("and(service_period_start.lte.2026-10-31,service_period_end.gte.2026-10-01)");
    expect(filter).toContain("and(paid_on.gte.2026-10-01,paid_on.lte.2026-10-31)");
    expect(() => expensePeriodFilter("2026-10-01),or(x", "2026-10-31")).toThrow();
  });
});
