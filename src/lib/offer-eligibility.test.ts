import { describe, expect, it } from "vitest";
import { isOfferEligibleItem } from "@/lib/offer-eligibility";

describe("isOfferEligibleItem", () => {
  it("allows available, customer-visible products", () => {
    expect(isOfferEligibleItem({ is_available: true, staff_only: false })).toBe(true);
    expect(isOfferEligibleItem({ is_available: true })).toBe(true);
  });

  it("rejects staff-only products, which customers cannot see", () => {
    expect(isOfferEligibleItem({ is_available: true, staff_only: true })).toBe(false);
  });

  it("rejects unavailable products", () => {
    expect(isOfferEligibleItem({ is_available: false, staff_only: false })).toBe(false);
  });
});
