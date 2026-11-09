import { describe, expect, it } from "vitest";

import {
  MAX_DAILY_SUMMARY_RECIPIENTS,
  parseDailySummaryPhones,
  resolveDailySummaryPhones
} from "./recipients";

describe("daily summary recipients", () => {
  it("normalizes, deduplicates, and limits configured recipients", () => {
    const phones = parseDailySummaryPhones(
      "050 111 1111\n+971 50 111 1111, 0502222222;0503333333\n0504444444\n0505555555\n0506666666"
    );

    expect(phones).toEqual([
      "971501111111",
      "971502222222",
      "971503333333",
      "971504444444",
      "971505555555"
    ]);
    expect(phones).toHaveLength(MAX_DAILY_SUMMARY_RECIPIENTS);
  });

  it("uses the legacy summary or owner phone only when no list is configured", () => {
    expect(
      resolveDailySummaryPhones({
        daily_summary_phones: [],
        daily_summary_phone: "0501234567",
        owner_phone: "0507654321",
        phone_country_code: "971"
      })
    ).toEqual(["971501234567"]);

    expect(
      resolveDailySummaryPhones({
        daily_summary_phones: null,
        daily_summary_phone: null,
        owner_phone: "98765 43210",
        phone_country_code: "91"
      })
    ).toEqual(["919876543210"]);
  });
});
