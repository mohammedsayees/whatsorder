import { describe, expect, it } from "vitest";
import { canMarkArrived, normalizeArrivalNote, waitingLabel } from "@/lib/car-arrival";

describe("canMarkArrived", () => {
  it("only allows active car-pickup orders", () => {
    expect(canMarkArrived({ fulfilment_type: "car_pickup", status: "Preparing" })).toBe(true);
    expect(canMarkArrived({ fulfilment_type: "car_pickup", status: "Ready to Serve" })).toBe(true);
    expect(canMarkArrived({ fulfilment_type: "car_pickup", status: "Completed" })).toBe(false);
    expect(canMarkArrived({ fulfilment_type: "car_pickup", status: "Cancelled" })).toBe(false);
    expect(canMarkArrived({ fulfilment_type: "takeaway", status: "Preparing" })).toBe(false);
    expect(canMarkArrived({ fulfilment_type: null, status: "New" })).toBe(false);
  });
});

describe("normalizeArrivalNote", () => {
  it("keeps a short single-line note", () => {
    expect(normalizeArrivalNote("  Bay 3,   near the pharmacy ")).toBe("Bay 3, near the pharmacy");
  });

  it("strips control characters and line breaks", () => {
    expect(normalizeArrivalNote("Bay\n3\u0007")).toBe("Bay 3");
  });

  it("caps the length", () => {
    expect(normalizeArrivalNote("x".repeat(200))).toHaveLength(80);
  });

  it("returns null for empty or non-text input", () => {
    expect(normalizeArrivalNote("   ")).toBeNull();
    expect(normalizeArrivalNote(42)).toBeNull();
    expect(normalizeArrivalNote(undefined)).toBeNull();
  });
});

describe("waitingLabel", () => {
  const arrived = "2026-11-17T10:00:00Z";

  it("formats the wait", () => {
    expect(waitingLabel(arrived, new Date("2026-11-17T10:00:30Z"))).toBe("just now");
    expect(waitingLabel(arrived, new Date("2026-11-17T10:04:00Z"))).toBe("4 min");
    expect(waitingLabel(arrived, new Date("2026-11-17T11:00:00Z"))).toBe("1 h");
    expect(waitingLabel(arrived, new Date("2026-11-17T11:05:00Z"))).toBe("1 h 5 min");
  });
});
