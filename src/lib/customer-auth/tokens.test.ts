import { beforeAll, describe, expect, it } from "vitest";

import { mintLinkToken, mintSessionToken, verifyLinkToken, verifySessionToken } from "./tokens";

beforeAll(() => {
  process.env.CUSTOMER_AUTH_SECRET = "x".repeat(48);
});

describe("customer auth tokens", () => {
  it("gives every link token its own one-time id", async () => {
    const identity = { restaurantId: "r1", phone: "971500000001" };
    const first = await verifyLinkToken(await mintLinkToken(identity));
    const second = await verifyLinkToken(await mintLinkToken(identity));
    expect(first.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.jti).not.toBe(first.jti);
    expect(first).toMatchObject(identity);
  });

  it("reports when a session was issued, for revocation", async () => {
    const before = Math.floor(Date.now() / 1000);
    const session = await verifySessionToken(
      await mintSessionToken({ restaurantId: "r1", phone: "971500000001" })
    );
    expect(session.issuedAt).toBeGreaterThanOrEqual(before);
    expect(session).toMatchObject({ restaurantId: "r1", phone: "971500000001" });
  });
});
