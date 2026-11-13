import { describe, expect, it } from "vitest";

import { buildPosterSubjectBundle } from "./subjects";

const admin = {} as never; // loyalty and festival-without-dish make no queries
const restaurant = (overrides: Record<string, unknown> = {}) =>
  ({
    id: "rest-1",
    name: "Chai Xpress",
    country_code: "AE",
    loyalty_enabled: true,
    loyalty_stamps_required: 8,
    loyalty_reward_description: "a free karak",
    ...overrides
  }) as never;

describe("Phase 7 subjects", () => {
  it("builds a loyalty poster from the real stamp-card terms", async () => {
    const bundle = await buildPosterSubjectBundle(admin, restaurant(), "loyalty", { loyalty: true });
    expect(bundle?.subject.loyalty).toEqual({ stamps: 8, reward: "a free karak" });
    expect(bundle?.facts).toMatchObject({ loyaltyStamps: 8, loyaltyReward: "a free karak", priceLines: [] });
    expect(bundle?.art).toBeNull();
  });

  it("refuses a loyalty poster when the stamp card is off", async () => {
    expect(await buildPosterSubjectBundle(admin, restaurant({ loyalty_enabled: false }), "loyalty", { loyalty: true })).toBeNull();
  });

  it("only offers the restaurant's own country's festivals", async () => {
    const eid = await buildPosterSubjectBundle(admin, restaurant(), "festival", { festival: "eid_al_fitr" });
    expect(eid?.subject.festival).toBe("eid_al_fitr");
    expect(eid?.facts.occasion).toBe("Eid al-Fitr");
    expect(await buildPosterSubjectBundle(admin, restaurant(), "festival", { festival: "diwali" })).toBeNull();
    expect(await buildPosterSubjectBundle(admin, restaurant({ country_code: "IN" }), "festival", { festival: "diwali" })).not.toBeNull();
  });

  it("rejects mismatched template / subject pairs", async () => {
    expect(await buildPosterSubjectBundle(admin, restaurant(), "loyalty", { offer_id: "x" })).toBeNull();
    expect(await buildPosterSubjectBundle(admin, restaurant(), "bestseller", { festival: "eid_al_fitr" })).toBeNull();
  });
});
