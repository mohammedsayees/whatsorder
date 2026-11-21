import { describe, expect, it } from "vitest";
import { fromSupabasePhone, maskPhone, toE164, toSupabasePhone } from "./phone";

describe("toE164", () => {
  it.each([
    ["050 123 4567", "+971501234567"],
    ["0501234567", "+971501234567"],
    ["501234567", "+971501234567"],
    ["+971 50 123 4567", "+971501234567"],
    ["00971501234567", "+971501234567"],
    ["971501234567", "+971501234567"],
    ["(050) 123-4567", "+971501234567"],
    ["٠٥٠١٢٣٤٥٦٧", "+971501234567"],
    ["۰۵۰۱۲۳۴۵۶۷", "+971501234567"],
    ["+44 7700 900123", "+447700900123"]
  ])("normalises %s", (input, expected) => {
    expect(toE164(input)).toBe(expected);
  });

  it.each(["", "abc", "050-CALL-ME", "+0123456789", "12345", "+1234567890123456"])(
    "rejects %s",
    (input) => {
      expect(toE164(input)).toBeNull();
    }
  );

  it("handles null and undefined", () => {
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
  });
});

describe("Supabase phone format", () => {
  it("drops and restores the plus", () => {
    expect(toSupabasePhone("+971501234567")).toBe("971501234567");
    expect(fromSupabasePhone("971501234567")).toBe("+971501234567");
    expect(fromSupabasePhone("+971501234567")).toBe("+971501234567");
    expect(fromSupabasePhone("")).toBeNull();
    expect(fromSupabasePhone(null)).toBeNull();
  });
});

describe("maskPhone", () => {
  it("keeps country, prefix and last four digits", () => {
    expect(maskPhone("+971501234567")).toBe("+971 50 ••• 4567");
  });
});
