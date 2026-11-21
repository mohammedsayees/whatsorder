import { describe, expect, it } from "vitest";
import { refreshCookieMaxAgeSeconds } from "./auth-cookies";

describe("refreshCookieMaxAgeSeconds", () => {
  it("keeps normal sessions at 30 days and WhatsApp sessions at 90", () => {
    expect(refreshCookieMaxAgeSeconds(false)).toBe(30 * 24 * 60 * 60);
    expect(refreshCookieMaxAgeSeconds(true)).toBe(90 * 24 * 60 * 60);
    expect(refreshCookieMaxAgeSeconds(true, 60)).toBe(60 * 24 * 60 * 60);
  });
});
