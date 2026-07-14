import { describe, expect, it } from "vitest";
import { evaluateDeliveryRange, haversineKm, hasDeliveryRadius } from "@/lib/geo";

// Ajman reference points (~roughly known separations).
const ajmanCenter = { latitude: 25.4052, longitude: 55.5136 };

describe("haversineKm", () => {
  it("returns ~0 for identical points", () => {
    expect(haversineKm(25.4052, 55.5136, 25.4052, 55.5136)).toBeCloseTo(0, 5);
  });

  it("computes a known distance within tolerance", () => {
    // ~1 degree of latitude is ~111 km.
    expect(haversineKm(25, 55, 26, 55)).toBeCloseTo(111.2, 0);
  });
});

describe("hasDeliveryRadius", () => {
  it("is off when no radius is set (backward-compatible default)", () => {
    expect(hasDeliveryRadius({ ...ajmanCenter, delivery_radius_km: null })).toBe(false);
    expect(hasDeliveryRadius({ ...ajmanCenter })).toBe(false);
  });

  it("is off when radius is set but coordinates are missing", () => {
    expect(
      hasDeliveryRadius({ latitude: null, longitude: null, delivery_radius_km: 3 })
    ).toBe(false);
  });

  it("is on with positive radius and coordinates", () => {
    expect(hasDeliveryRadius({ ...ajmanCenter, delivery_radius_km: 3 })).toBe(true);
  });
});

describe("evaluateDeliveryRange", () => {
  it("allows delivery unconditionally when no radius is set", () => {
    const result = evaluateDeliveryRange(
      { ...ajmanCenter, delivery_radius_km: null },
      { latitude: 0, longitude: 0 }
    );
    expect(result).toEqual({ enforced: false, distanceKm: null, withinRange: true });
  });

  it("blocks delivery when radius is enforced but no customer location is given", () => {
    const result = evaluateDeliveryRange(
      { ...ajmanCenter, delivery_radius_km: 3 },
      null
    );
    expect(result.enforced).toBe(true);
    expect(result.withinRange).toBe(false);
    expect(result.distanceKm).toBeNull();
  });

  it("allows a customer inside the radius", () => {
    const result = evaluateDeliveryRange(
      { ...ajmanCenter, delivery_radius_km: 3 },
      { latitude: 25.41, longitude: 55.515 }
    );
    expect(result.enforced).toBe(true);
    expect(result.withinRange).toBe(true);
    expect(result.distanceKm).not.toBeNull();
  });

  it("blocks a customer outside the radius and reports the distance", () => {
    const result = evaluateDeliveryRange(
      { ...ajmanCenter, delivery_radius_km: 3 },
      { latitude: 25.5, longitude: 55.6 }
    );
    expect(result.enforced).toBe(true);
    expect(result.withinRange).toBe(false);
    expect(result.distanceKm).toBeGreaterThan(3);
  });
});
