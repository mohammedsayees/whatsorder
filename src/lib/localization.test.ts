import { describe, expect, it } from "vitest";
import { formatCurrency } from "./currency";
import { formatRestaurantDateTime } from "./date-time";
import { getCountryProfile, getRestaurantLocalization } from "./localization";
import { isRestaurantOpen } from "./opening-hours";
import { resolveReportRange } from "./reports";
import { normalizeCustomerPhone } from "./whatsapp";

const india = getRestaurantLocalization({ country_code: "IN" });

describe("multi-country restaurant localization", () => {
  it("maps India to one constrained profile", () => {
    expect(getCountryProfile("IN")).toMatchObject({
      currencyCode: "INR",
      phoneCountryCode: "91",
      timeZone: "Asia/Kolkata"
    });
  });

  it("formats restaurant money in INR", () => {
    expect(formatCurrency(1250, india)).toContain("₹");
  });

  it("normalizes Indian local mobile numbers to E.164 digits", () => {
    expect(normalizeCustomerPhone("98765 43210", "91")).toBe("919876543210");
    expect(normalizeCustomerPhone("09876543210", "91")).toBe("919876543210");
  });

  it("uses Kolkata for operational timestamps and opening hours", () => {
    expect(formatRestaurantDateTime("2026-07-13T03:00:00.000Z", india)).toContain(
      "8:30"
    );

    const schedule = {
      monday: { closed: false, open: "08:00", close: "09:00" }
    };
    expect(
      isRestaurantOpen(
        true,
        schedule,
        new Date("2026-07-13T03:00:00.000Z"),
        "Asia/Kolkata"
      )
    ).toBe(true);
    expect(
      isRestaurantOpen(
        true,
        schedule,
        new Date("2026-07-13T03:00:00.000Z"),
        "Asia/Dubai"
      )
    ).toBe(false);
  });

  it("builds report boundaries at India local midnight", () => {
    const range = resolveReportRange(
      "today",
      undefined,
      undefined,
      new Date("2026-07-13T20:00:00.000Z"),
      india
    );

    expect(range.startDate).toBe("2026-07-14");
    expect(range.startIso).toBe("2026-07-14T00:00:00+05:30");
  });
});
