import { describe, expect, it } from "vitest";
import {
  buildOwnerLoginLinkSuffix,
  buildOwnerLoginLinkUrl,
  parseOwnerLoginLinkToken
} from "./link-token";

const ID = "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90";

describe("owner login link token", () => {
  it("round-trips", () => {
    const suffix = buildOwnerLoginLinkSuffix(ID, "123456");
    expect(suffix).toBe(`${ID}.123456`);
    expect(parseOwnerLoginLinkToken(suffix)).toEqual({ requestId: ID, code: "123456" });
  });

  it("builds the URL the template button points at", () => {
    expect(buildOwnerLoginLinkUrl("https://app.example/", ID, "000123")).toBe(
      `https://app.example/auth/wa/${ID}.000123`
    );
  });

  it("refuses to build from bad parts", () => {
    expect(() => buildOwnerLoginLinkSuffix("not-a-uuid", "123456")).toThrow();
    expect(() => buildOwnerLoginLinkSuffix(ID, "12345")).toThrow();
  });

  it.each([
    null,
    "",
    ID,
    `${ID}.`,
    `${ID}.12345`,
    `${ID}.1234567`,
    `${ID}.12a456`,
    `not-a-uuid.123456`,
    `${ID}.123456.123456`,
    `${"x".repeat(100)}.123456`,
    "link-expired"
  ])("rejects %s", (token) => {
    expect(parseOwnerLoginLinkToken(token)).toBeNull();
  });
});
