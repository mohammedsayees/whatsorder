import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildCustomerLinkUrl, verifyMetaSignature } from "./whatsapp-cloud";

describe("buildCustomerLinkUrl", () => {
  it("builds a link route URL with an encoded next param", () => {
    expect(buildCustomerLinkUrl("https://app.example.com", "tok123", "chaixpress")).toBe(
      "https://app.example.com/api/customer/link?token=tok123&next=%2Fr%2Fchaixpress"
    );
  });

  it("strips a trailing slash from the base URL", () => {
    expect(buildCustomerLinkUrl("https://app.example.com/", "t", "slug")).toBe(
      "https://app.example.com/api/customer/link?token=t&next=%2Fr%2Fslug"
    );
  });
});

describe("verifyMetaSignature", () => {
  const secret = "app-secret";
  const body = JSON.stringify({ hello: "world" });
  const valid = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  it("accepts a correct signature", () => {
    expect(verifyMetaSignature(body, valid, secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    expect(verifyMetaSignature(body + "x", valid, secret)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    expect(verifyMetaSignature(body, valid, "other-secret")).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, "deadbeef", secret)).toBe(false);
  });

  it("rejects when no app secret is configured", () => {
    expect(verifyMetaSignature(body, valid, undefined)).toBe(false);
  });
});
