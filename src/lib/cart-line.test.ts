import { describe, expect, it } from "vitest";
import {
  cartLineKey,
  configuredUnitPrice,
  formatLineOptions,
  formatOrderItemName
} from "./cart-line";
import type { CartLineOption } from "./types";

const optionA: CartLineOption = {
  option_id: "opt-a",
  group_id: "grp-1",
  name: "Large",
  name_ar: "كبير",
  price_delta: 3
};

const optionB: CartLineOption = {
  option_id: "opt-b",
  group_id: "grp-2",
  name: "No sugar",
  name_ar: null,
  price_delta: 0
};

describe("cartLineKey", () => {
  it("is stable under option selection order", () => {
    expect(cartLineKey({ item_id: "item-1", options: [optionA, optionB] })).toBe(
      cartLineKey({ item_id: "item-1", options: [optionB, optionA] })
    );
  });

  it("distinguishes different configurations of the same item", () => {
    expect(cartLineKey({ item_id: "item-1", options: [optionA] })).not.toBe(
      cartLineKey({ item_id: "item-1", options: [optionB] })
    );
  });

  it("distinguishes offer lines from plain lines", () => {
    expect(cartLineKey({ item_id: "item-1", offer_id: "offer-1" })).not.toBe(
      cartLineKey({ item_id: "item-1" })
    );
  });

  it("degrades to legacy behavior for optionless lines", () => {
    expect(cartLineKey({ item_id: "item-1" })).toBe("item-1|");
    expect(cartLineKey({ item_id: "item-1", offer_id: null, options: undefined })).toBe(
      "item-1|"
    );
  });
});

describe("formatLineOptions / formatOrderItemName", () => {
  it("joins option names in English", () => {
    expect(formatLineOptions([optionA, optionB])).toBe("Large, No sugar");
  });

  it("uses Arabic names with English fallback", () => {
    expect(formatLineOptions([optionA, optionB], "ar")).toBe("كبير, No sugar");
  });

  it("returns null for no options", () => {
    expect(formatLineOptions(undefined)).toBeNull();
    expect(formatLineOptions([])).toBeNull();
  });

  it("formats the composed item name", () => {
    expect(
      formatOrderItemName({ name: "Karak", name_ar: null, options: [optionA] })
    ).toBe("Karak (Large)");
    expect(formatOrderItemName({ name: "Karak", name_ar: null })).toBe("Karak");
  });
});

describe("configuredUnitPrice", () => {
  it("adds deltas to the base price", () => {
    expect(configuredUnitPrice(5, [optionA, optionB])).toBe(8);
  });

  it("clamps negative totals at zero", () => {
    expect(
      configuredUnitPrice(2, [{ ...optionA, price_delta: -5 }])
    ).toBe(0);
  });

  it("returns the base price with no options", () => {
    expect(configuredUnitPrice(5, undefined)).toBe(5);
  });
});
