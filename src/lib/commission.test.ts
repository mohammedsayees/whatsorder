import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMMISSION_RATE,
  computeCommissionKept,
  resolveCommissionRate
} from "@/lib/commission";

const totals = {
  monthOrders: 9,
  monthBase: 159,
  allTimeOrders: 40,
  allTimeBase: 1000
};

describe("resolveCommissionRate", () => {
  it("uses the owner-set rate when valid", () => {
    expect(resolveCommissionRate(30)).toEqual({ rate: 30, isDefaultRate: false });
    expect(resolveCommissionRate(100)).toEqual({ rate: 100, isDefaultRate: false });
  });

  it("falls back to the labelled default when unset", () => {
    expect(resolveCommissionRate(null)).toEqual({
      rate: DEFAULT_COMMISSION_RATE,
      isDefaultRate: true
    });
    expect(resolveCommissionRate(undefined).isDefaultRate).toBe(true);
  });

  it("rejects non-positive, NaN and out-of-range rates as default", () => {
    expect(resolveCommissionRate(0).isDefaultRate).toBe(true);
    expect(resolveCommissionRate(-5).isDefaultRate).toBe(true);
    expect(resolveCommissionRate(Number.NaN).isDefaultRate).toBe(true);
    expect(resolveCommissionRate(150).isDefaultRate).toBe(true);
  });
});

describe("computeCommissionKept", () => {
  it("applies the default 27% when no rate is set", () => {
    const result = computeCommissionKept(totals, null);
    expect(result.rate).toBe(27);
    expect(result.isDefaultRate).toBe(true);
    expect(result.month).toEqual({ orders: 9, kept: 159 * 0.27 });
    expect(result.allTime).toEqual({ orders: 40, kept: 1000 * 0.27 });
  });

  it("applies an owner-set rate", () => {
    const result = computeCommissionKept(totals, 30);
    expect(result.rate).toBe(30);
    expect(result.isDefaultRate).toBe(false);
    expect(result.allTime.kept).toBe(300);
  });

  it("returns zero kept when there are no delivery orders", () => {
    const result = computeCommissionKept(
      { monthOrders: 0, monthBase: 0, allTimeOrders: 0, allTimeBase: 0 },
      25
    );
    expect(result.month.kept).toBe(0);
    expect(result.allTime.kept).toBe(0);
  });
});
