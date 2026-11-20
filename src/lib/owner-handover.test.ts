import { describe, expect, it } from "vitest";

import {
  buildOwnerHandoverMessage,
  buildWhatsAppUrl,
  getOwnerAccessState
} from "./owner-handover";

const base = {
  restaurantName: "Al Sadaf Cafeteria",
  storeUrl: "https://example.test/r/sadaf-cafeteria",
  loginUrl: "https://example.test/admin-login"
};

describe("getOwnerAccessState", () => {
  it("maps membership timestamps to a state", () => {
    expect(getOwnerAccessState(null)).toBe("not_invited");
    expect(getOwnerAccessState({ invited_at: "2026-11-20" })).toBe("invited");
    expect(getOwnerAccessState({ invited_at: "2026-11-20", accepted_at: "2026-11-21" })).toBe("active");
  });
});

describe("buildOwnerHandoverMessage", () => {
  it("includes the store link, login link and first name", () => {
    const message = buildOwnerHandoverMessage({ ...base, ownerName: "Shahul Hameed", accessState: "active" });
    expect(message).toContain("Hi Shahul!");
    expect(message).toContain(base.storeUrl);
    expect(message).toContain(base.loginUrl);
    expect(message).not.toContain("invite");
  });

  it("points an invited owner to the invite email", () => {
    const message = buildOwnerHandoverMessage({
      ...base,
      ownerEmail: "owner@example.test",
      accessState: "invited"
    });
    expect(message).toContain("Hi!");
    expect(message).toContain("emailed an invite to owner@example.test");
  });

  it("says an invite is coming when none was sent", () => {
    expect(buildOwnerHandoverMessage({ ...base, accessState: "not_invited" })).toContain(
      "We'll email you an invite"
    );
  });
});

describe("buildWhatsAppUrl", () => {
  it("targets the owner's number and encodes the text", () => {
    expect(buildWhatsAppUrl("Hi & welcome", "+971 50 123 4567")).toBe(
      "https://wa.me/971501234567?text=Hi%20%26%20welcome"
    );
  });

  it("strips a 00 international prefix", () => {
    expect(buildWhatsAppUrl("x", "00971501234567")).toBe("https://wa.me/971501234567?text=x");
  });

  it("falls back to the contact picker without a usable number", () => {
    expect(buildWhatsAppUrl("x", null)).toBe("https://wa.me/?text=x");
    expect(buildWhatsAppUrl("x", "123")).toBe("https://wa.me/?text=x");
  });
});
