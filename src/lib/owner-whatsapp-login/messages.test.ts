import { describe, expect, it } from "vitest";
import { ownerLoginCodeMessage, ownerLoginLinkMessage } from "./messages";

describe("owner login messages", () => {
  it("puts the code alone on its own line, in English and Arabic", () => {
    const text = ownerLoginCodeMessage("123456");
    expect(text).toContain("\n\n123456\n\n");
    expect(text).toContain("رمز الدخول");
    expect(text).toContain("Do not share this code");
  });

  it("names the restaurant and carries the link", () => {
    const text = ownerLoginLinkMessage("Chai Xpress", "https://app.example/auth/wa/x.123456");
    expect(text).toContain("Chai Xpress");
    expect(text).toContain("\nhttps://app.example/auth/wa/x.123456\n");
    expect(text).toContain("10 minutes");
  });

  it("falls back to a neutral name", () => {
    expect(ownerLoginLinkMessage("  ", "https://x")).toContain("your restaurant");
  });
});
