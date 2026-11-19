import { describe, expect, it } from "vitest";
import { detectPaymentMixup, rankMixupCandidates } from "@/lib/payment-mixup";

describe("detectPaymentMixup", () => {
  it("flags cash over with card short (13 Nov: +135.79 / -34.50)", () => {
    expect(detectPaymentMixup({ cash: 135.79, card: -34.5 })).toEqual({
      overMethod: "cash", shortMethod: "card", overAmount: 135.79, shortAmount: 34.5
    });
  });

  it("flags card over with cash short", () => {
    expect(detectPaymentMixup({ cash: -20, card: 20 }))
      .toMatchObject({ overMethod: "card", shortMethod: "cash" });
  });

  it("ignores same-direction differences and counting noise", () => {
    expect(detectPaymentMixup({ cash: 40.25, card: 13 })).toBeNull(); // both over: unbilled sales, not a mix-up
    expect(detectPaymentMixup({ cash: -0.75, card: 0.5 })).toBeNull();
    expect(detectPaymentMixup({ cash: 0, card: null })).toBeNull();
  });

  it("picks the pair with the larger overlap when UPI is involved", () => {
    expect(detectPaymentMixup({ cash: 30, card: -2, upi: -25 }))
      .toMatchObject({ overMethod: "cash", shortMethod: "upi", shortAmount: 25 });
  });
});

describe("rankMixupCandidates", () => {
  it("puts an exact match first and drops orders larger than the gap", () => {
    const ranked = rankMixupCandidates(
      [{ id: "a", total: 12 }, { id: "b", total: 34.5 }, { id: "c", total: 60 }, { id: "d", total: 30 }],
      { overMethod: "cash", shortMethod: "card", overAmount: 135.79, shortAmount: 34.5 }
    );
    expect(ranked.map((order) => order.id)).toEqual(["b", "d", "a"]);
    expect(ranked[0].exactMatch).toBe(true);
    expect(ranked[1].exactMatch).toBe(false);
  });
});
