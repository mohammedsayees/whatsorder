import { describe, expect, it } from "vitest";
import {
  isAwaitingAcceptanceTooLong,
  isOrderActive,
  progressIndex,
  progressSteps,
  stepTimes
} from "@/lib/order-progress";

describe("progressSteps", () => {
  it("ends delivery orders with on-the-way then done", () => {
    expect(progressSteps("delivery")).toEqual([
      "sent",
      "accepted",
      "preparing",
      "onTheWay",
      "done"
    ]);
  });

  it("uses a ready step for every other mode", () => {
    for (const mode of ["takeaway", "car_pickup", "dine_in", null] as const) {
      expect(progressSteps(mode)[3]).toBe("ready");
    }
  });
});

describe("progressIndex", () => {
  it("maps statuses onto steps", () => {
    expect(progressIndex("New")).toBe(0);
    expect(progressIndex("Accepted")).toBe(1);
    expect(progressIndex("Preparing")).toBe(2);
    expect(progressIndex("Ready to Serve")).toBe(3);
    expect(progressIndex("Out for Delivery")).toBe(3);
    expect(progressIndex("Completed")).toBe(4);
    expect(progressIndex("Cancelled")).toBeNull();
  });

  it("knows which orders are still in progress", () => {
    expect(isOrderActive("Preparing")).toBe(true);
    expect(isOrderActive("Completed")).toBe(false);
    expect(isOrderActive("Cancelled")).toBe(false);
  });
});

describe("stepTimes", () => {
  it("uses the first event per step and leaves skipped steps empty", () => {
    expect(
      stepTimes(
        "2026-11-17T10:00:00Z",
        [
          { to_status: "Ready to Serve", created_at: "2026-11-17T10:12:00Z" },
          { to_status: "Accepted", created_at: "2026-11-17T10:02:00Z" },
          { to_status: "Accepted", created_at: "2026-11-17T10:05:00Z" },
          { to_status: "Cancelled", created_at: "2026-11-17T10:20:00Z" }
        ],
        5
      )
    ).toEqual([
      "2026-11-17T10:00:00Z",
      "2026-11-17T10:02:00Z",
      null,
      "2026-11-17T10:12:00Z",
      null
    ]);
  });
});

describe("isAwaitingAcceptanceTooLong", () => {
  const created = "2026-11-17T10:00:00Z";

  it("flags New orders after the wait window", () => {
    expect(isAwaitingAcceptanceTooLong("New", created, new Date("2026-11-17T10:09:59Z"))).toBe(
      false
    );
    expect(isAwaitingAcceptanceTooLong("New", created, new Date("2026-11-17T10:10:00Z"))).toBe(
      true
    );
  });

  it("never flags accepted orders or unknown times", () => {
    expect(
      isAwaitingAcceptanceTooLong("Accepted", created, new Date("2026-11-17T11:00:00Z"))
    ).toBe(false);
    expect(isAwaitingAcceptanceTooLong("New", null, new Date())).toBe(false);
    expect(isAwaitingAcceptanceTooLong("New", "not a date", new Date())).toBe(false);
  });
});
