import { describe, expect, it } from "vitest";
import {
  calculateCashDifference,
  calculateExpectedCash
} from "@/lib/shift-calculations";

describe("shift cash calculations", () => {
  it("subtracts paid-outs from opening cash and completed cash orders", () => {
    expect(calculateExpectedCash(200, 1000, 100)).toBe(1100);
  });

  it("reports shortages as negative and excess as positive", () => {
    expect(calculateCashDifference(1080, 1100)).toBe(-20);
    expect(calculateCashDifference(1125, 1100)).toBe(25);
  });

  it("rounds monetary arithmetic to two decimal places", () => {
    expect(calculateExpectedCash(0.1, 0.2, 0)).toBe(0.3);
  });
});
