import { describe, expect, it } from "vitest";
import { getRestaurantDayStartIso } from "@/lib/date-time";

describe("getRestaurantDayStartIso", () => {
  it("returns local midnight as UTC for each restaurant time zone", () => {
    expect(getRestaurantDayStartIso("2026-11-18", { time_zone: "Asia/Dubai" }))
      .toBe("2026-11-17T20:00:00.000Z");
    expect(getRestaurantDayStartIso("2026-11-18", { time_zone: "Asia/Kolkata", country_code: "IN" }))
      .toBe("2026-11-17T18:30:00.000Z");
  });

  it("rejects malformed and impossible dates", () => {
    expect(getRestaurantDayStartIso("18-11-2026")).toBeNull();
    expect(getRestaurantDayStartIso("2026-02-31")).toBeNull();
    expect(getRestaurantDayStartIso("2026-11-18T00:00")).toBeNull();
    expect(getRestaurantDayStartIso("")).toBeNull();
  });
});
