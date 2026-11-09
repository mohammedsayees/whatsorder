import { describe, expect, it } from "vitest";

import {
  hashDemoClaimToken,
  parseDemoClaimCookie,
  serializeDemoClaimCookie
} from "@/lib/demo-claim";

describe("demo claim proof", () => {
  const restaurantId = "11111111-1111-4111-8111-111111111111";
  const token = "A".repeat(43);

  it("persists a deterministic SHA-256 digest rather than the raw proof", () => {
    const digest = hashDemoClaimToken(token);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain(token);
  });

  it("round-trips a valid HTTP-only cookie payload", () => {
    expect(parseDemoClaimCookie(serializeDemoClaimCookie(restaurantId, token))).toEqual({
      restaurantId,
      token
    });
  });

  it("rejects malformed restaurant ids and short tokens", () => {
    expect(parseDemoClaimCookie(`not-a-uuid.${token}`)).toBeNull();
    expect(parseDemoClaimCookie(`${restaurantId}.short`)).toBeNull();
  });
});
