import { describe, expect, it } from "vitest";
import {
  classifyMembershipCount,
  hasValidInvitationMetadata,
  isRestaurantAdminAccessAllowed,
  isOfferQuantityAllowed,
  isValidCustomerPhone,
  minimumOrderRemaining,
  MAX_OPTIONS_PER_LINE,
  parseAndValidateCart
} from "./security";

describe("tenant access security", () => {
  it("rejects ambiguous multi-restaurant memberships", () => {
    expect(classifyMembershipCount(0)).toBe("no_membership");
    expect(classifyMembershipCount(1)).toBe("ok");
    expect(classifyMembershipCount(2)).toBe("multiple_memberships");
  });

  it("blocks paused and cancelled restaurant dashboards", () => {
    expect(isRestaurantAdminAccessAllowed("live")).toBe(true);
    expect(isRestaurantAdminAccessAllowed("onboarding")).toBe(true);
    expect(isRestaurantAdminAccessAllowed("paused")).toBe(false);
    expect(isRestaurantAdminAccessAllowed("cancelled")).toBe(false);
  });
});

describe("invitation security", () => {
  it("requires a restaurant and supported role", () => {
    expect(hasValidInvitationMetadata("restaurant-id", "manager")).toBe(true);
    expect(hasValidInvitationMetadata("", "manager")).toBe(false);
    expect(hasValidInvitationMetadata("restaurant-id", "super_admin")).toBe(false);
  });
});

describe("public order input security", () => {
  it("calculates the amount remaining before checkout", () => {
    expect(minimumOrderRemaining(2, 15)).toBe(13);
    expect(minimumOrderRemaining(15, 15)).toBe(0);
    expect(minimumOrderRemaining(20, 15)).toBe(0);
  });

  it("accepts a bounded valid cart", () => {
    const cart = parseAndValidateCart(
      JSON.stringify([{ item_id: "item-1", name: "Tea", price: 2, quantity: 2 }])
    );
    expect(cart).toHaveLength(1);
    expect(cart[0].quantity).toBe(2);
  });

  it("preserves an offer reference for server-side price validation", () => {
    const cart = parseAndValidateCart(
      JSON.stringify([
        {
          item_id: "item-1",
          offer_id: "offer-1",
          offer_max_quantity: 2,
          name: "Tea offer",
          price: 1,
          quantity: 1
        }
      ])
    );

    expect(cart[0].offer_id).toBe("offer-1");
    expect(cart[0].offer_max_quantity).toBe(2);
  });

  it("enforces promotional quantity limits", () => {
    expect(isOfferQuantityAllowed(1, 1)).toBe(true);
    expect(isOfferQuantityAllowed(2, 3)).toBe(true);
    expect(isOfferQuantityAllowed(4, 3)).toBe(false);
  });

  it("rejects oversized or partially invalid carts", () => {
    expect(
      parseAndValidateCart(
        JSON.stringify([{ item_id: "item-1", name: "Tea", price: 2, quantity: 26 }])
      )
    ).toEqual([]);

    expect(
      parseAndValidateCart(
        JSON.stringify([
          { item_id: "item-1", name: "Tea", price: 2, quantity: 1 },
          { item_id: "", name: "Invalid", price: 1, quantity: 1 }
        ])
      )
    ).toEqual([]);
  });

  it("validates customer phone input", () => {
    expect(isValidCustomerPhone("+971 55 123 4567")).toBe(true);
    expect(isValidCustomerPhone("0551234567")).toBe(true);
    expect(isValidCustomerPhone("not-a-phone")).toBe(false);
  });
});

describe("cart option input security", () => {
  const baseLine = {
    item_id: "item-1",
    name: "Karak",
    quantity: 1,
    price: 5
  };
  const validOption = {
    option_id: "opt-1",
    group_id: "grp-1",
    name: "Large",
    price_delta: 3
  };

  it("passes options through with whitelisted fields only", () => {
    const [line] = parseAndValidateCart(
      JSON.stringify([
        { ...baseLine, options: [{ ...validOption, injected: "x", name_ar: "كبير" }] }
      ])
    );

    expect(line.options).toEqual([
      {
        option_id: "opt-1",
        group_id: "grp-1",
        name: "Large",
        name_ar: "كبير",
        price_delta: 3
      }
    ]);
  });

  it("omits the options key for optionless lines", () => {
    const [line] = parseAndValidateCart(JSON.stringify([baseLine]));
    expect(line).not.toHaveProperty("options");

    const [emptyLine] = parseAndValidateCart(
      JSON.stringify([{ ...baseLine, options: [] }])
    );
    expect(emptyLine).not.toHaveProperty("options");
  });

  it("rejects the whole cart on malformed options", () => {
    const malformed = [
      { ...baseLine, options: "not-an-array" },
      undefined
    ][0];
    expect(parseAndValidateCart(JSON.stringify([malformed]))).toEqual([]);

    expect(
      parseAndValidateCart(
        JSON.stringify([{ ...baseLine, options: [{ ...validOption, option_id: "" }] }])
      )
    ).toEqual([]);

    expect(
      parseAndValidateCart(
        JSON.stringify([
          { ...baseLine, options: [{ ...validOption, price_delta: "abc" }] }
        ])
      )
    ).toEqual([]);
  });

  it("rejects duplicate options on a line", () => {
    expect(
      parseAndValidateCart(
        JSON.stringify([{ ...baseLine, options: [validOption, validOption] }])
      )
    ).toEqual([]);
  });

  it("rejects more than MAX_OPTIONS_PER_LINE options", () => {
    const tooMany = Array.from({ length: MAX_OPTIONS_PER_LINE + 1 }, (_, index) => ({
      ...validOption,
      option_id: `opt-${index}`
    }));
    expect(
      parseAndValidateCart(JSON.stringify([{ ...baseLine, options: tooMany }]))
    ).toEqual([]);
  });

  it("truncates oversized option names", () => {
    const [line] = parseAndValidateCart(
      JSON.stringify([
        { ...baseLine, options: [{ ...validOption, name: "x".repeat(500) }] }
      ])
    );
    expect(line.options?.[0].name).toHaveLength(120);
  });
});
