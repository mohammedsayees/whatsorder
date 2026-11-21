import { describe, expect, it } from "vitest";
import { decodeOwnerLoginPhoneCookie, encodeOwnerLoginPhoneCookie, resendSecondsLeft } from "./pending-phone";

describe("pending login phone cookie", () => {
  it("round-trips", () => {
    const value = encodeOwnerLoginPhoneCookie("+971501234567", 1_700_000_000_123);
    expect(decodeOwnerLoginPhoneCookie(value)).toEqual({ phoneE164: "+971501234567", requestedAtMs: 1_700_000_000_123 });
  });

  it.each([undefined, null, "", "+971501234567", "0501234567|1", "+971501234567|soon", "+971501234567|-5"])(
    "rejects %s",
    (value) => {
      expect(decodeOwnerLoginPhoneCookie(value)).toBeNull();
    }
  );

  it("counts the resend cooldown down to zero", () => {
    expect(resendSecondsLeft(1000, 60, 1000)).toBe(60);
    expect(resendSecondsLeft(1000, 60, 31_500)).toBe(30);
    expect(resendSecondsLeft(1000, 60, 61_000)).toBe(0);
    expect(resendSecondsLeft(1000, 60, 999_999)).toBe(0);
  });
});
