import { describe, expect, it } from "vitest";
import {
  buildOrderStatusMessage,
  isServiceWindowOpen,
  orderReference
} from "./order-notifications";

const NOW = new Date("2026-07-03T12:00:00.000Z");

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

describe("isServiceWindowOpen", () => {
  it("is open shortly after an inbound message", () => {
    expect(isServiceWindowOpen(hoursAgo(1), NOW)).toBe(true);
  });

  it("is closed after 24 hours", () => {
    expect(isServiceWindowOpen(hoursAgo(24.5), NOW)).toBe(false);
  });

  it("closes inside the safety margin before expiry", () => {
    // 23h56m elapsed — inside the 5-minute margin, treated as closed.
    expect(isServiceWindowOpen(hoursAgo(23 + 56 / 60), NOW)).toBe(false);
    // 23h50m elapsed — still open.
    expect(isServiceWindowOpen(hoursAgo(23 + 50 / 60), NOW)).toBe(true);
  });

  it("is closed for missing or malformed timestamps", () => {
    expect(isServiceWindowOpen(null, NOW)).toBe(false);
    expect(isServiceWindowOpen(undefined, NOW)).toBe(false);
    expect(isServiceWindowOpen("not-a-date", NOW)).toBe(false);
  });

  it("is closed for timestamps in the future (clock skew)", () => {
    expect(isServiceWindowOpen(hoursAgo(-1), NOW)).toBe(false);
  });
});

describe("orderReference", () => {
  it("uses the ticket-style short reference", () => {
    expect(orderReference("00000000-0000-4000-8000-0000abcd1234")).toBe("ABCD1234");
  });
});

describe("buildOrderStatusMessage", () => {
  const base = { orderReference: "ABCD1234", restaurantName: "Chai Xpress" };

  it("returns bilingual text for notifiable statuses", () => {
    for (const status of [
      "Accepted",
      "Ready to Serve",
      "Out for Delivery",
      "Completed",
      "Cancelled"
    ] as const) {
      const message = buildOrderStatusMessage({ ...base, status });
      expect(message).toBeTruthy();
      expect(message).toContain("ABCD1234");
      expect(message).toContain("Chai Xpress");
      // Arabic line present
      expect(message).toMatch(/[؀-ۿ]/);
    }
  });

  it("skips New and Preparing", () => {
    expect(buildOrderStatusMessage({ ...base, status: "New" })).toBeNull();
    expect(buildOrderStatusMessage({ ...base, status: "Preparing" })).toBeNull();
  });

  it("appends the loyalty line on completion", () => {
    const message = buildOrderStatusMessage({
      ...base,
      status: "Completed",
      loyaltyLine: "You're at 4 of 10 stamps — 6 more for a free karak ☕"
    });
    expect(message).toContain("4 of 10 stamps");
  });

  it("omits the loyalty block when the program is disabled", () => {
    const message = buildOrderStatusMessage({
      ...base,
      status: "Completed",
      loyaltyLine: ""
    });
    expect(message).not.toContain("stamps");
  });
});
