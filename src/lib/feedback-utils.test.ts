import { describe, expect, it } from "vitest";
import { customerDisplayName, hashFeedbackToken } from "./feedback-utils";

describe("feedback privacy helpers", () => {
  it("shortens a customer name for public display", () => {
    expect(customerDisplayName("Ahmed Mohammed Ali", false)).toBe("Ahmed A.");
    expect(customerDisplayName("Aisha", false)).toBe("Aisha");
    expect(customerDisplayName("", false)).toBe("Verified customer");
  });

  it("supports anonymous reviews", () => {
    expect(customerDisplayName("Ahmed Ali", true)).toBe("Anonymous");
  });

  it("stores only a deterministic token hash", () => {
    const token = "private-feedback-token";
    expect(hashFeedbackToken(token)).toHaveLength(64);
    expect(hashFeedbackToken(token)).not.toBe(token);
    expect(hashFeedbackToken(token)).toBe(hashFeedbackToken(token));
  });
});
