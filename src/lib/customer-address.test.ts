import { describe, expect, it } from "vitest";
import {
  cleanAddressDetails,
  composeDeliveryAddress,
  liftLegacyAddress,
  parseComposedAddress,
  parseCheckoutPreferences,
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

describe("liftLegacyAddress", () => {
  it("moves a one-line legacy address into Building", () => {
    expect(liftLegacyAddress({ building: "", flat: "", details: " Building 12, Flat 304 " })).toEqual({
      building: "Building 12, Flat 304",
      flat: "",
      details: ""
    });
  });

  it("leaves structured or over-long addresses alone", () => {
    const structured = { building: "Al Noor Tower", flat: "", details: "Blue gate" };
    expect(liftLegacyAddress(structured)).toBe(structured);
    const withFlat = { building: "", flat: "12", details: "Street 5" };
    expect(liftLegacyAddress(withFlat)).toBe(withFlat);
    const long = { building: "", flat: "", details: "x".repeat(121) };
    expect(liftLegacyAddress(long)).toBe(long);
  });
});

describe("composed address repeated in details (doubled delivery address)", () => {
  const composed = "Building/Villa: Rawdha3, Flat/Floor: 203";

  it("does not print the building and flat twice", () => {
    expect(
      composeDeliveryAddress({ building: "Rawdha3", flat: "203", details: composed }, "en")
    ).toBe(composed);
  });

  it("keeps real street text after the repeated part", () => {
    expect(
      composeDeliveryAddress(
        { building: "Rawdha3", flat: "203", details: `${composed}, near the mosque` },
        "en"
      )
    ).toBe(`${composed}, near the mosque`);
  });

  it("removes a stale copy so the rider never sees two different flats", () => {
    expect(
      composeDeliveryAddress(
        { building: "Rawdha3", flat: "204", details: "Building/Villa: Rawdha3, Flat/Floor: 203" },
        "en"
      )
    ).toBe("Building/Villa: Rawdha3, Flat/Floor: 204");
  });

  it("handles commas inside the building name and Arabic labels", () => {
    expect(
      cleanAddressDetails({
        building: "Tower A, Marina",
        flat: "9",
        details: "Building/Villa: Tower A, Marina, Flat/Floor: 9"
      })
    ).toBe("");
    expect(
      composeDeliveryAddress(
        { building: "برج النور", flat: "12", details: "المبنى/الفيلا: برج النور, الشقة/الطابق: 12" },
        "ar"
      )
    ).toBe("المبنى/الفيلا: برج النور, الشقة/الطابق: 12");
  });

  it("never drops text: labelled text stays when its field is empty", () => {
    expect(cleanAddressDetails({ building: "", flat: "", details: composed })).toBe(composed);
    expect(cleanAddressDetails({ building: "Rawdha3", flat: "", details: composed })).toBe("Flat/Floor: 203");
    expect(cleanAddressDetails({ building: "A", flat: "1", details: "Street 5, blue door" })).toBe(
      "Street 5, blue door"
    );
  });

  it("heals device copies when they are read back", () => {
    const raw = JSON.stringify({
      building: "Rawdha3",
      flat: "203",
      details: composed,
      area: "Realkarak building"
    });
    expect(parseSavedDetails(raw)?.details).toBe("");
  });
});

describe("parseComposedAddress / liftLegacyAddress with a composed last-order address", () => {
  it("splits the composed text back into fields", () => {
    expect(parseComposedAddress("Building/Villa: Rawdha3, Flat/Floor: 203")).toEqual({
      building: "Rawdha3",
      flat: "203",
      details: ""
    });
    expect(parseComposedAddress("Building/Villa: Rawdha3, Street 5, blue door")).toEqual({
      building: "Rawdha3",
      flat: "",
      details: "Street 5, blue door"
    });
    expect(parseComposedAddress("Villa 12, Street 5")).toBeNull();
  });

  it("round-trips with composeDeliveryAddress", () => {
    const parts = { building: "Al Noor Tower", flat: "1204", details: "Street 5, blue door" };
    const parsed = parseComposedAddress(composeDeliveryAddress(parts, "en"));
    expect(parsed).toEqual(parts);
  });

  it("lifts a prefilled composed address into the right boxes, not all into Building", () => {
    const lifted = liftLegacyAddress({
      building: "",
      flat: "",
      details: "Building/Villa: Rawdha3, Flat/Floor: 203"
    });
    expect(lifted).toEqual({ building: "Rawdha3", flat: "203", details: "" });
    expect(composeDeliveryAddress(lifted, "en")).toBe("Building/Villa: Rawdha3, Flat/Floor: 203");
  });
});

describe("parseCheckoutPreferences", () => {
  const allowed = ["Cash on Delivery", "Online Payment"];

  it("keeps known payment methods and boolean consent", () => {
    expect(
      parseCheckoutPreferences(JSON.stringify({ paymentMethod: "Online Payment", consentMarketing: true }), allowed)
    ).toEqual({ paymentMethod: "Online Payment", consentMarketing: true });
  });

  it("drops unavailable methods and junk", () => {
    expect(parseCheckoutPreferences(JSON.stringify({ paymentMethod: "UPI", consentMarketing: "yes" }), allowed)).toEqual({
      paymentMethod: null,
      consentMarketing: null
    });
    expect(parseCheckoutPreferences("not json", allowed)).toEqual({ paymentMethod: null, consentMarketing: null });
    expect(parseCheckoutPreferences(null, allowed)).toEqual({ paymentMethod: null, consentMarketing: null });
  });
});
