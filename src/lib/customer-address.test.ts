import { describe, expect, it } from "vitest";
import {
  composeDeliveryAddress,
  parseSavedDetails,
  savedDetailsStorageKey
} from "@/lib/customer-address";

describe("composeDeliveryAddress", () => {
  it("labels building and flat, then appends free details", () => {
    expect(
      composeDeliveryAddress(
        { building: " Al Noor Tower ", flat: "1204", details: "Street 5, blue door" },
        "en"
      )
    ).toBe("Building/Villa: Al Noor Tower, Flat/Floor: 1204, Street 5, blue door");
  });

  it("skips empty parts", () => {
    expect(composeDeliveryAddress({ building: "", flat: "", details: "Villa 12" }, "en")).toBe(
      "Villa 12"
    );
    expect(composeDeliveryAddress({ building: "", flat: "", details: "  " }, "en")).toBe("");
  });

  it("uses Arabic labels for Arabic orders", () => {
    expect(composeDeliveryAddress({ building: "برج النور", flat: "12", details: "" }, "ar")).toBe(
      "المبنى/الفيلا: برج النور, الشقة/الطابق: 12"
    );
  });

  it("never exceeds the server limit", () => {
    const long = "x".repeat(400);
    expect(
      composeDeliveryAddress({ building: long, flat: long, details: long }, "en").length
    ).toBeLessThanOrEqual(500);
  });
});

describe("parseSavedDetails", () => {
  it("rejects missing, malformed and empty payloads", () => {
    expect(parseSavedDetails(null)).toBeNull();
    expect(parseSavedDetails("{oops")).toBeNull();
    expect(parseSavedDetails("[]")).toBeNull();
    expect(parseSavedDetails(JSON.stringify({ name: "  " }))).toBeNull();
  });

  it("keeps known string fields, trimmed and length-limited", () => {
    const parsed = parseSavedDetails(
      JSON.stringify({ name: " Sara ", phone: 501234567, flat: "9".repeat(100), extra: "x" })
    );
    expect(parsed?.name).toBe("Sara");
    expect(parsed?.phone).toBe("");
    expect(parsed?.flat).toHaveLength(60);
    expect(parsed).not.toHaveProperty("extra");
  });

  it("keeps coordinates only as a valid pair", () => {
    expect(
      parseSavedDetails(JSON.stringify({ area: "Nahda", latitude: 25.3, longitude: 55.4 }))
    ).toMatchObject({ latitude: 25.3, longitude: 55.4 });
    expect(
      parseSavedDetails(JSON.stringify({ area: "Nahda", latitude: 25.3, longitude: 500 }))
    ).toMatchObject({ latitude: null, longitude: null });
    expect(
      parseSavedDetails(JSON.stringify({ area: "Nahda", latitude: 25.3 }))
    ).toMatchObject({ latitude: null, longitude: null });
  });

  it("scopes storage per restaurant", () => {
    expect(savedDetailsStorageKey("a")).not.toBe(savedDetailsStorageKey("b"));
  });
});
