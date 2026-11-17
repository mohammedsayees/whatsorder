import { describe, expect, it } from "vitest";
import {
  formatDistance,
  isRiderVisibleToCustomer,
  parseRiderFix,
  riderFirstName
} from "@/lib/rider-location";

describe("parseRiderFix", () => {
  it("accepts a normal GPS fix and rounds it", () => {
    expect(parseRiderFix({ latitude: 25.4123456789, longitude: 55.4456789123, accuracy: 12.6 })).toEqual({
      latitude: 25.412346,
      longitude: 55.445679,
      accuracy: 13
    });
  });

  it("allows a missing accuracy", () => {
    expect(parseRiderFix({ latitude: 25, longitude: 55 })?.accuracy).toBeNull();
  });

  it.each([
    null,
    "25,55",
    { latitude: "25", longitude: 55 },
    { latitude: 95, longitude: 55 },
    { latitude: 25, longitude: 190 },
    { latitude: 0, longitude: 0 },
    { latitude: Number.NaN, longitude: 55 },
    { latitude: 25, longitude: 55, accuracy: 5000 }
  ])("rejects bad fixes: %j", (value) => {
    expect(parseRiderFix(value)).toBeNull();
  });
});

describe("display helpers", () => {
  it("shows the rider only while out for delivery", () => {
    expect(isRiderVisibleToCustomer("Out for Delivery")).toBe(true);
    expect(isRiderVisibleToCustomer("Preparing")).toBe(false);
    expect(isRiderVisibleToCustomer("Completed")).toBe(false);
  });

  it("formats distances for people", () => {
    expect(formatDistance(0.01)).toBe("50 m");
    expect(formatDistance(0.34)).toBe("350 m");
    expect(formatDistance(1.234)).toBe("1.2 km");
    expect(formatDistance(12.6)).toBe("13 km");
  });

  it("uses the rider's first name", () => {
    expect(riderFirstName("  Ravi Kumar ")).toBe("Ravi");
    expect(riderFirstName("")).toBe("Your rider");
  });
});
