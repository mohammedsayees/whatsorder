import { describe, expect, it } from "vitest";
import {
  parseReferralSettingsInput,
  parseReferralSummary,
  referralSource,
  shouldShowReferral
} from "@/lib/referrals";

describe("referralSource", () => {
  it("builds a src token that passes the attribution format", () => {
    expect(referralSource("AB12cd")).toBe("ref-ab12cd");
    expect(referralSource(" ab12cd ")).toBe("ref-ab12cd");
  });

  it("rejects codes that are the wrong shape", () => {
    expect(referralSource("ab")).toBeNull();
    expect(referralSource("a b c d")).toBeNull();
    expect(referralSource("abcdefghijklm")).toBeNull();
    expect(referralSource("ab-12")).toBeNull();
    expect(referralSource(null)).toBeNull();
  });
});

describe("parseReferralSummary", () => {
  it("normalizes the RPC payload", () => {
    expect(
      parseReferralSummary({
        enabled: true,
        balance: "40",
        points_each: 20,
        redeem_points: 100,
        reward_value: "5.00"
      })
    ).toEqual({ enabled: true, balance: 40, pointsEach: 20, redeemPoints: 100, rewardValue: 5 });
  });

  it("returns null for junk and never reports a negative balance", () => {
    expect(parseReferralSummary(null)).toBeNull();
    expect(parseReferralSummary({ enabled: true, balance: -5 })?.balance).toBe(0);
  });

  it("shows the card when the programme is on or points remain", () => {
    const base = { enabled: false, balance: 0, pointsEach: 20, redeemPoints: 100, rewardValue: 5 };
    expect(shouldShowReferral(base)).toBe(false);
    expect(shouldShowReferral({ ...base, enabled: true })).toBe(true);
    expect(shouldShowReferral({ ...base, balance: 20 })).toBe(true);
    expect(shouldShowReferral(null)).toBe(false);
  });
});

describe("parseReferralSettingsInput", () => {
  it("passes sensible values through", () => {
    expect(
      parseReferralSettingsInput({
        enabled: true,
        pointsEach: "25",
        redeemPoints: "150",
        rewardValue: "7.5",
        minOrder: "20"
      })
    ).toEqual({
      referral_enabled: true,
      referral_points_each: 25,
      referral_redeem_points: 150,
      referral_reward_value: 7.5,
      referral_min_order: 20
    });
  });

  it("clamps to what the database accepts and falls back on junk", () => {
    expect(
      parseReferralSettingsInput({
        enabled: false,
        pointsEach: "0",
        redeemPoints: "9999999",
        rewardValue: "-3",
        minOrder: "abc"
      })
    ).toEqual({
      referral_enabled: false,
      referral_points_each: 1,
      referral_redeem_points: 100000,
      referral_reward_value: 1,
      referral_min_order: 0
    });
  });
});
