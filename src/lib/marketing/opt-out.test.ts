import { describe, expect, it } from "vitest";

import {
  isMarketingOptOutKeyword,
  marketingConsentWithdrawalFields,
  optOutConfirmationMessage
} from "./opt-out";

describe("isMarketingOptOutKeyword", () => {
  it.each([
    "STOP",
    "stop",
    "  Stop  ",
    "\nSTOP\n",
    "UNSUBSCRIBE",
    "unsubscribe",
    "إيقاف",
    "ايقاف",
    "إلغاء",
    "الغاء",
    " إلغاء ",
    "‏إيقاف‏", // RTL marks phones insert
    "إلـغـاء", // tatweel
    "ＳＴＯＰ" // full-width (NFKC)
  ])("matches %j", (text) => {
    expect(isMarketingOptOutKeyword(text)).toBe(true);
  });

  it.each([
    "",
    "   ",
    null,
    undefined,
    "stop the onions please",
    "Please stop",
    "STOP!",
    "stopp",
    "unsub",
    "إيقاف الطلب",
    "hi",
    "1 karak chai"
  ])("does not match %j", (text) => {
    expect(isMarketingOptOutKeyword(text)).toBe(false);
  });
});

describe("marketingConsentWithdrawalFields", () => {
  it("withdraws every marketing flag with the given source and time", () => {
    const now = new Date("2026-11-13T10:00:00.000Z");
    expect(marketingConsentWithdrawalFields("customer_replied_stop", now)).toEqual({
      consent_marketing: false,
      marketing_opt_in: false,
      marketing_consent_source: "customer_replied_stop",
      marketing_consent_updated_at: "2026-11-13T10:00:00.000Z",
      marketing_consent_withdrawn_at: "2026-11-13T10:00:00.000Z"
    });
  });
});

describe("optOutConfirmationMessage", () => {
  it("names the restaurant and is short", () => {
    const message = optOutConfirmationMessage("Chai Xpress");
    expect(message).toContain("Chai Xpress");
    expect(message.length).toBeLessThan(160);
  });
});
