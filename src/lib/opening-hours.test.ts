import { describe, expect, it } from "vitest";
import {
  defaultOpeningHours,
  isRestaurantOpen,
  nextOpening,
  normalizeOpeningHours
} from "@/lib/opening-hours";

describe("restaurant opening hours", () => {
  it("does not restrict ordering until weekly hours are enabled", () => {
    const closedSchedule = normalizeOpeningHours({
      monday: { closed: true, open: "08:00", close: "23:00" }
    });

    expect(
      isRestaurantOpen(false, closedSchedule, new Date("2026-06-22T08:00:00Z"))
    ).toBe(true);
  });

  it("checks normal UAE opening windows", () => {
    const schedule = {
      ...defaultOpeningHours,
      monday: { closed: false, open: "08:00", close: "23:00" }
    };

    expect(
      isRestaurantOpen(true, schedule, new Date("2026-06-22T08:00:00Z"))
    ).toBe(true);
    expect(
      isRestaurantOpen(true, schedule, new Date("2026-06-22T20:00:00Z"))
    ).toBe(false);
  });

  it("supports overnight café hours", () => {
    const schedule = {
      ...defaultOpeningHours,
      monday: { closed: false, open: "18:00", close: "02:00" },
      tuesday: { closed: true, open: "08:00", close: "23:00" }
    };

    expect(
      isRestaurantOpen(true, schedule, new Date("2026-06-22T20:30:00Z"))
    ).toBe(true);
    expect(
      isRestaurantOpen(true, schedule, new Date("2026-06-22T22:30:00Z"))
    ).toBe(false);
  });
});

describe("nextOpening", () => {
  const schedule = {
    ...defaultOpeningHours,
    monday: { closed: false, open: "07:00", close: "23:00" },
    tuesday: { closed: true, open: "07:00", close: "23:00" },
    wednesday: { closed: false, open: "09:30", close: "23:00" }
  };
  // 2026-06-22 is a Monday. Dubai is UTC+4.

  it("returns later today before opening time", () => {
    // 05:12 Dubai.
    expect(nextOpening(true, schedule, new Date("2026-06-22T01:12:00Z"), "Asia/Dubai")).toEqual({
      daysAhead: 0,
      day: "monday",
      time: "07:00"
    });
  });

  it("skips closed days after closing time", () => {
    // 23:30 Monday Dubai; Tuesday is closed.
    expect(nextOpening(true, schedule, new Date("2026-06-22T19:30:00Z"), "Asia/Dubai")).toEqual({
      daysAhead: 2,
      day: "wednesday",
      time: "09:30"
    });
  });

  it("is null when hours are off or every day is closed", () => {
    expect(nextOpening(false, schedule, new Date("2026-06-22T01:12:00Z"))).toBeNull();
    const allClosed = Object.fromEntries(
      Object.entries(defaultOpeningHours).map(([day, hours]) => [day, { ...hours, closed: true }])
    );
    expect(nextOpening(true, allClosed, new Date("2026-06-22T01:12:00Z"))).toBeNull();
  });
});
