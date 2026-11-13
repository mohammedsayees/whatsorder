import { describe, expect, it } from "vitest";

import { safeCustomerLinkNext } from "./safe-next";

describe("safeCustomerLinkNext", () => {
  it("keeps café paths", () => {
    expect(safeCustomerLinkNext("/r/chaixpress")).toBe("/r/chaixpress");
    expect(safeCustomerLinkNext("/r/chaixpress/")).toBe("/r/chaixpress/");
    expect(safeCustomerLinkNext("/r/chai-xpress/checkout")).toBe("/r/chai-xpress/checkout");
  });

  it.each([
    "/\\evil.example",
    "/\\/evil.example",
    "//evil.example",
    "https://evil.example",
    "/r/../admin",
    "/r/x?next=//evil.example",
    "/r/%2F%2Fevil.example",
    "/admin",
    "",
    null
  ])("rejects %s", (value) => {
    expect(safeCustomerLinkNext(value)).toBe("/");
  });

  it("never resolves off-origin", () => {
    const origin = "https://app.example";
    for (const value of ["/\\evil.example", "/r/ok"]) {
      expect(new URL(safeCustomerLinkNext(value), origin).origin).toBe(origin);
    }
  });
});
