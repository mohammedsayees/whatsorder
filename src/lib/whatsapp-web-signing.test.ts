import { describe, expect, it } from "vitest";
import {
  CONNECTOR_SIGNATURE_TOLERANCE_MS,
  signConnectorPayload,
  verifyConnectorPayload
} from "./whatsapp-web-signing";

describe("WhatsApp Web connector signatures", () => {
  it("accepts a current correctly signed payload", () => {
    const now = 1_720_000_000_000;
    const timestamp = String(now);
    const body = JSON.stringify({ type: "connected", restaurantId: "r1" });
    const signature = signConnectorPayload(body, timestamp, "secret");

    expect(
      verifyConnectorPayload({ body, timestamp, signature, secret: "secret", now })
    ).toBe(true);
  });

  it("rejects tampering and replayed payloads", () => {
    const now = 1_720_000_000_000;
    const timestamp = String(now);
    const signature = signConnectorPayload("original", timestamp, "secret");

    expect(
      verifyConnectorPayload({ body: "changed", timestamp, signature, secret: "secret", now })
    ).toBe(false);
    expect(
      verifyConnectorPayload({
        body: "original",
        timestamp,
        signature,
        secret: "secret",
        now: now + CONNECTOR_SIGNATURE_TOLERANCE_MS + 1
      })
    ).toBe(false);
  });

  it("binds a signature to its HTTP target", () => {
    const now = 1_720_000_000_000;
    const timestamp = String(now);
    const body = JSON.stringify({ restaurantId: "r1" });
    const signature = signConnectorPayload(
      body,
      timestamp,
      "secret",
      "POST:/sessions/one/connect"
    );
    expect(
      verifyConnectorPayload({
        body,
        timestamp,
        signature,
        secret: "secret",
        target: "POST:/sessions/two/connect",
        now
      })
    ).toBe(false);
  });
});
