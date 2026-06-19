import { describe, expect, it } from "vitest";
import {
  formatUaeDateTime,
  getUaeMonthStartIso,
  isSameUaeCalendarDay
} from "@/lib/date-time";

describe("UAE date and time helpers", () => {
  it("formats UTC timestamps in Dubai time", () => {
    expect(formatUaeDateTime("2026-06-19T02:44:15.000Z")).toContain("6:44:15");
  });

  it("compares days using the Dubai calendar", () => {
    expect(
      isSameUaeCalendarDay(
        "2026-06-18T20:30:00.000Z",
        "2026-06-19T18:00:00.000Z"
      )
    ).toBe(true);
    expect(
      isSameUaeCalendarDay(
        "2026-06-18T19:59:59.000Z",
        "2026-06-19T18:00:00.000Z"
      )
    ).toBe(false);
  });

  it("returns the UTC instant for the start of a Dubai month", () => {
    expect(getUaeMonthStartIso("2026-06-19T12:00:00.000Z")).toBe(
      "2026-05-31T20:00:00.000Z"
    );
  });
});
