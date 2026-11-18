import { describe, expect, it } from "vitest";
import type { FinanceOperatingReport } from "@/lib/finance-report";
import {
  buildSimpleSummary,
  categoryIcon,
  categoryLabel,
  filsToInput,
  firstDayOfPreviousMonth,
  friendlyDate,
  monthlyBillSchedule,
  inputToFils,
  paymentFields,
  plainBillStatus,
  plainPaymentStatus,
  resolveFinanceMode
} from "@/lib/finance-simple";

const format = (fils: number) => `AED ${(fils / 100).toFixed(2)}`;

function report(overrides: Partial<FinanceOperatingReport> = {}): FinanceOperatingReport {
  return {
    orderCount: 10, grossCustomerSalesFils: 105_000, deliveryFeesFils: 0, outputVatFils: 5_000,
    netSalesFils: 100_000, knownDirectCostFils: 30_000, estimatedConsumedCostFils: 30_000,
    channelFeesFils: 0, accruedOperatingCostFils: 40_000, purchaseSpendFils: 0, cashOutflowFils: 0,
    estimatedOperatingResultFils: 30_000, coveragePct: 100, breakEvenSalesFils: null,
    products: [], warnings: [], ...overrides
  };
}

describe("finance mode", () => {
  it("is simple for everyone unless an owner or admin opts in", () => {
    expect(resolveFinanceMode("staff", "advanced")).toBe("simple");
    expect(resolveFinanceMode("manager", "advanced")).toBe("simple");
    expect(resolveFinanceMode("owner", undefined)).toBe("simple");
    expect(resolveFinanceMode("owner", "advanced")).toBe("advanced");
    expect(resolveFinanceMode("restaurant_admin", "advanced")).toBe("advanced");
  });
});

describe("plain words", () => {
  it("gives the default categories friendly names and icons", () => {
    expect(categoryLabel("Ingredients & packaging")).toBe("Food, drinks & packaging");
    expect(categoryLabel("Equipment / capex")).toBe("Equipment");
    expect(categoryLabel("Rent")).toBe("Rent");
    expect(categoryIcon("Rent")).toBe("🏠");
    expect(categoryIcon("Salaries")).toBe("👥");
    expect(categoryIcon("Utilities")).toBe("💡");
    expect(categoryIcon("Something new")).toBe("➕");
  });

  it("shows dates like a person would say them", () => {
    const now = new Date("2026-11-18T10:00:00Z");
    expect(friendlyDate("2026-11-18", now)).toBe("18 Nov");
    expect(friendlyDate("2025-12-01", now)).toBe("1 Dec 2025");
  });

  it("describes payment and bill status without jargon", () => {
    expect(plainPaymentStatus("unpaid")).toBe("Not paid yet");
    expect(plainPaymentStatus("partial")).toBe("Part paid");
    expect(plainBillStatus("draft")).toBe("Not checked yet");
  });
});

describe("payment answers", () => {
  it("map to the fields the existing actions expect", () => {
    expect(paymentFields("till", "2026-11-18")).toMatchObject({ pay_from_till: "on" });
    expect(paymentFields("card", "2026-11-18")).toEqual({ payment_status: "paid", payment_method: "card", paid_on: "2026-11-18" });
    expect(paymentFields("bank", "2026-11-18").payment_method).toBe("bank_transfer");
    expect(paymentFields("later", "2026-11-18")).toEqual({ payment_status: "unpaid", payment_method: "", paid_on: "" });
  });
});

describe("amounts", () => {
  it("converts between form text and fils exactly", () => {
    expect(inputToFils("52.5")).toBe(5250);
    expect(inputToFils("0")).toBe(0);
    expect(inputToFils("12.345")).toBeNull();
    expect(inputToFils("abc")).toBeNull();
    expect(filsToInput(5250)).toBe("52.50");
    expect(filsToInput(null)).toBe("");
  });
});

describe("simple summary", () => {
  it("adds food, delivery and monthly costs and explains them", () => {
    const summary = buildSimpleSummary(report(), report({ estimatedOperatingResultFils: 20_000 }), format);
    expect(summary.costsFils).toBe(70_000);
    expect(summary.profitFils).toBe(30_000);
    expect(summary.trend).toBe("up");
    expect(summary.sentences).toContain("Food costs are about 30% of sales – healthy for a café.");
  });

  it("warns when rent and salaries are missing or menu costs are unknown", () => {
    const summary = buildSimpleSummary(
      report({
        accruedOperatingCostFils: 0,
        estimatedConsumedCostFils: null,
        estimatedOperatingResultFils: null,
        products: [{ menuItemId: "a", name: "Karak", units: 3, netRevenueFils: 300, directCostFils: null, channelFeesFils: 0, contributionFils: null, contributionPerUnitFils: null, completeness: "incomplete" }]
      }),
      report(),
      format
    );
    expect(summary.profitFils).toBeNull();
    expect(summary.trend).toBe("unknown");
    expect(summary.sentences.join(" ")).toContain("No rent or salaries added yet");
    expect(summary.sentences.join(" ")).toContain("1 menu item has no food cost yet");
  });
});

describe("setup dates", () => {
  it("starts quick costs from the first day of last month", () => {
    expect(firstDayOfPreviousMonth("2026-11-18")).toBe("2026-10-01");
    expect(firstDayOfPreviousMonth("2026-01-05")).toBe("2025-12-01");
  });

  it("counts a monthly bill from the 1st and finds its next due day", () => {
    expect(monthlyBillSchedule("2026-11-18", 25)).toEqual({ startOn: "2026-11-01", nextDueOn: "2026-11-25" });
    expect(monthlyBillSchedule("2026-11-18", 5)).toEqual({ startOn: "2026-11-01", nextDueOn: "2026-12-05" });
    expect(monthlyBillSchedule("2026-12-18", 1)).toEqual({ startOn: "2026-12-01", nextDueOn: "2027-01-01" });
  });
});

