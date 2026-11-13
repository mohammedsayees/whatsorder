import { describe, expect, it } from "vitest";

import { savingStampLabel, trimWholeAmount } from "./offer-math";

const aed = (amount: number) =>
  new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2
  }).format(amount);

describe("trimWholeAmount", () => {
  it("drops trailing .00 only", () => {
    expect(trimWholeAmount("AED 12.00")).toBe("AED 12");
    expect(trimWholeAmount("₹1,200.00")).toBe("₹1,200");
    expect(trimWholeAmount("AED 12.50")).toBe("AED 12.50");
    expect(trimWholeAmount("AED 100")).toBe("AED 100");
  });
});

describe("savingStampLabel", () => {
  it("prefers an exact multiple-of-5 percentage", () => {
    expect(savingStampLabel(16, 12, aed)).toBe("25% OFF");
    expect(savingStampLabel(20, 10, aed)).toBe("50% OFF");
  });

  it("falls back to a whole-currency saving", () => {
    expect(savingStampLabel(15, 11, aed)).toMatch(/^SAVE AED\s4$/);
  });

  it("otherwise rounds the percentage down, never up", () => {
    // 15 → 11.50 saves 3.50 = 23.33%
    expect(savingStampLabel(15, 11.5, aed)).toBe("23% OFF");
  });

  it("is computed in minor units (no float noise)", () => {
    expect(savingStampLabel(15, 11.25, aed)).toBe("25% OFF");
  });

  it("shows nothing when there is no real cut", () => {
    expect(savingStampLabel(12, 12, aed)).toBeNull();
    expect(savingStampLabel(12, 14, aed)).toBeNull();
    expect(savingStampLabel(null, 10, aed)).toBeNull();
    expect(savingStampLabel(0, 0, aed)).toBeNull();
    // A tiny, non-whole saving isn't worth a stamp.
    expect(savingStampLabel(100, 99.5, aed)).toBeNull();
  });
});
