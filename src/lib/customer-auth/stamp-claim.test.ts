import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import {
  buildStampClaimUrl,
  mintStampClaimToken,
  pendingStampClaimKey,
  verifyStampClaimToken
} from "./stamp-claim";
import { mintLinkToken } from "./tokens";

const SECRET = "x".repeat(48);
const claim = {
  restaurantId: "23000000-0000-0000-0000-000000000001",
  orderId: "43000000-0000-4000-8000-000000000001"
};

describe("stamp claim tokens", () => {
  beforeEach(() => {
    vi.stubEnv("CUSTOMER_AUTH_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("round-trips a claim", async () => {
    const token = await mintStampClaimToken(claim);
    expect(await verifyStampClaimToken(token)).toEqual(claim);
  });

  it("rejects tampered, foreign-audience and missing tokens", async () => {
    const token = (await mintStampClaimToken(claim)) as string;
    expect(await verifyStampClaimToken(`${token.slice(0, -2)}xx`)).toBeNull();
    // A customer login link must never work as a claim (and vice versa).
    const login = await mintLinkToken({ restaurantId: claim.restaurantId, phone: "971501234567" });
    expect(await verifyStampClaimToken(login)).toBeNull();
    const other = await new SignJWT({ rid: claim.restaurantId, oid: claim.orderId })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("wo:stamp:claim")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("y".repeat(48)));
    expect(await verifyStampClaimToken(other)).toBeNull();
    expect(await verifyStampClaimToken("")).toBeNull();
    expect(await verifyStampClaimToken(null)).toBeNull();
  });

  it("expires after 24 hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-20T10:00:00Z"));
    const token = await mintStampClaimToken(claim);
    vi.setSystemTime(new Date("2026-11-21T09:59:00Z"));
    expect(await verifyStampClaimToken(token)).toEqual(claim);
    vi.setSystemTime(new Date("2026-11-21T10:01:00Z"));
    expect(await verifyStampClaimToken(token)).toBeNull();
  });

  it("does nothing without a configured secret", async () => {
    vi.stubEnv("CUSTOMER_AUTH_SECRET", "");
    expect(await mintStampClaimToken(claim)).toBeNull();
    expect(await verifyStampClaimToken("anything")).toBeNull();
  });

  it("builds the receipt URL and the device key", () => {
    expect(buildStampClaimUrl("https://app.test/", "chaixpress", "a.b c")).toBe(
      "https://app.test/r/chaixpress/stamp?t=a.b%20c"
    );
    expect(pendingStampClaimKey("chaixpress")).toBe("whatsorder-stamp-claim-v1-chaixpress");
  });
});
