import { describe, expect, it } from "vitest";
import {
  availableFulfilmentTypes,
  fulfilmentStorageKey,
  isFulfilmentType,
  resolveFulfilmentType
} from "@/lib/customer-fulfilment";

describe("availableFulfilmentTypes", () => {
  it("defaults to delivery only", () => {
    expect(availableFulfilmentTypes({})).toEqual(["delivery"]);
  });

  it("lists every enabled mode in display order", () => {
    expect(
      availableFulfilmentTypes({
        delivery_enabled: true,
        pickup_enabled: true,
        car_pickup_enabled: true,
        dine_in_enabled: true
      })
    ).toEqual(["delivery", "takeaway", "car_pickup", "dine_in"]);
  });

  it("drops delivery when explicitly disabled", () => {
    expect(
      availableFulfilmentTypes({ delivery_enabled: false, car_pickup_enabled: true })
    ).toEqual(["car_pickup"]);
  });
});

describe("resolveFulfilmentType", () => {
  const all = ["delivery", "takeaway", "car_pickup", "dine_in"] as const;

  it("prefers dine-in when the QR code carries a table number", () => {
    expect(
      resolveFulfilmentType({ available: [...all], stored: "car_pickup", tableNumber: "12" })
    ).toBe("dine_in");
  });

  it("ignores a table number when dine-in is off", () => {
    expect(
      resolveFulfilmentType({ available: ["delivery", "takeaway"], stored: null, tableNumber: "12" })
    ).toBe("delivery");
  });

  it("restores the saved choice when it is still offered", () => {
    expect(resolveFulfilmentType({ available: [...all], stored: "car_pickup" })).toBe("car_pickup");
  });

  it("falls back when the saved choice is no longer offered or invalid", () => {
    expect(
      resolveFulfilmentType({ available: ["takeaway", "dine_in"], stored: "delivery" })
    ).toBe("takeaway");
    expect(resolveFulfilmentType({ available: ["takeaway"], stored: "drone" })).toBe("takeaway");
  });

  it("keeps delivery as the last resort", () => {
    expect(resolveFulfilmentType({ available: [], stored: null })).toBe("delivery");
  });
});

describe("storage helpers", () => {
  it("scopes the key per restaurant", () => {
    expect(fulfilmentStorageKey("chaixpress")).not.toBe(fulfilmentStorageKey("other"));
  });

  it("validates mode strings", () => {
    expect(isFulfilmentType("dine_in")).toBe(true);
    expect(isFulfilmentType("pickup")).toBe(false);
    expect(isFulfilmentType(null)).toBe(false);
  });
});
