import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mintStampClaimCode, verifyStampClaimCode } from "./stamp-claim-code";

const claim = {
  restaurantId: "23000000-0000-0000-0000-000000000001",
  orderId: "43000000-0000-4000-8000-000000000001"
};
const now = Date.UTC(2026, 10, 22, 6, 0, 0);
const exp = Math.floor(now / 1000) + 3600;

describe("stamp claim codes", () => {
  beforeEach(() => vi.stubEnv("CUSTOMER_AUTH_SECRET", "x".repeat(48)));
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips to the order for the same café, and stays short", () => {
    const code = mintStampClaimCode(claim, exp)!;
    expect(code.length).toBeLessThanOrEqual(60);
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}\.[a-z0-9]+\.[A-Za-z0-9_-]{22}$/);
    expect(verifyStampClaimCode(code, claim.restaurantId, now)).toBe(claim.orderId);
  });

  it("rejects another café, expiry and tampering", () => {
    const code = mintStampClaimCode(claim, exp)!;
    expect(verifyStampClaimCode(code, "23000000-0000-0000-0000-000000000002", now)).toBeNull();
    expect(verifyStampClaimCode(code, claim.restaurantId, exp * 1000 + 1)).toBeNull();
    const [order, expiry, sig] = code.split(".");
    expect(verifyStampClaimCode(`${order}.${(exp + 60).toString(36)}.${sig}`, claim.restaurantId, now)).toBeNull();
    const otherOrder = mintStampClaimCode({ ...claim, orderId: "43000000-0000-4000-8000-000000000002" }, exp)!;
    expect(verifyStampClaimCode(`${otherOrder.split(".")[0]}.${expiry}.${sig}`, claim.restaurantId, now)).toBeNull();
    expect(verifyStampClaimCode(`${order}.${expiry}`, claim.restaurantId, now)).toBeNull();
    expect(verifyStampClaimCode("", claim.restaurantId, now)).toBeNull();
  });

  it("needs the secret", () => {
    const code = mintStampClaimCode(claim, exp)!;
    vi.stubEnv("CUSTOMER_AUTH_SECRET", "");
    expect(mintStampClaimCode(claim, exp)).toBeNull();
    expect(verifyStampClaimCode(code, claim.restaurantId, now)).toBeNull();
  });
});
