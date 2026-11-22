import { describe, expect, it } from "vitest";
import { loyaltyRewardName } from "./loyalty-reward";

describe("loyaltyRewardName", () => {
  it("drops a leading 'free' so copy never says 'a free Free …'", () => {
    expect(loyaltyRewardName("Free Crunch Burger")).toBe("Crunch Burger");
    expect(loyaltyRewardName("FREE: Karak Tea")).toBe("Karak Tea");
    expect(loyaltyRewardName("  free karak ")).toBe("karak");
  });

  it("keeps names that merely contain the word", () => {
    expect(loyaltyRewardName("Freedom Shake")).toBe("Freedom Shake");
    expect(loyaltyRewardName("Karak Tea")).toBe("Karak Tea");
  });

  it("drops an Arabic 'free' word at either end", () => {
    expect(loyaltyRewardName("برجر مجاني")).toBe("برجر");
    expect(loyaltyRewardName("مجانا كرك")).toBe("كرك");
  });

  it("returns null when nothing is left", () => {
    expect(loyaltyRewardName("Free")).toBeNull();
    expect(loyaltyRewardName(null)).toBeNull();
    expect(loyaltyRewardName("   ")).toBeNull();
  });
});
