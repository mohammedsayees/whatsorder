import { describe, expect, it } from "vitest";
import {
  defaultOpeningHours,
  isRestaurantOpen,
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
