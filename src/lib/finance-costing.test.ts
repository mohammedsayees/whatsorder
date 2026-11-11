import { describe, expect, it } from "vitest";
import {
  allocateFils,
  normalizedUnitCostFils,
  recipeLineCostFils,
  splitVatInclusiveFils,
  variableFeeFils
} from "@/lib/finance-costing";

describe("finance costing", () => {
  it("normalizes kg purchases to usable grams with yield", () => {
    expect(normalizedUnitCostFils({
      canonicalUnit: "g",
      packCount: 2,
      packSize: 1,
      packUnit: "kg",
      totalCostFils: 3600,
      yieldPct: 90
    })).toBe(2);
  });

  it("applies recipe waste before rounding to fils", () => {
    expect(recipeLineCostFils(150, 2, 10)).toBe(330);
  });

  it("allocates discounts exactly with deterministic largest remainders", () => {
    const allocated = allocateFils(100, [333, 333, 334]);
    expect(allocated).toEqual([33, 33, 34]);
    expect(allocated.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it("conserves cents for UAE VAT-inclusive totals", () => {
    const result = splitVatInclusiveFils(1800, 500);
    expect(result).toEqual({ netFils: 1714, vatFils: 86 });
    expect(result.netFils + result.vatFils).toBe(1800);
  });

  it("calculates deterministic variable channel fees", () => {
    expect(variableFeeFils(10000, 2700)).toBe(2700);
  });
});
