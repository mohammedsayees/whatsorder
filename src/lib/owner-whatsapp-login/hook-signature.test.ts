import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStandardWebhook } from "./hook-signature";

const keyBytes = Buffer.from("0123456789abcdef0123456789abcdef");
const secret = `v1,whsec_${keyBytes.toString("base64")}`;
const body = JSON.stringify({ user: { phone: "971501234567" }, sms: { otp: "123456" } });
const id = "msg_1";
const now = 1_800_000_000;

function sign(content: string, key = keyBytes) {
  return `v1,${createHmac("sha256", key).update(content).digest("base64")}`;
}

const valid = {
  body,
  id,
  timestamp: String(now),
  signature: sign(`${id}.${now}.${body}`),
  secret,
  nowSeconds: now
};

describe("verifyStandardWebhook", () => {
  it("accepts a correctly signed request", () => {
    expect(verifyStandardWebhook(valid)).toBe(true);
  });

  it("accepts one valid signature among several", () => {
    expect(
      verifyStandardWebhook({ ...valid, signature: `v1,bm9wZQ== ${valid.signature}` })
    ).toBe(true);
  });

  it("accepts the secret without its prefixes", () => {
    expect(verifyStandardWebhook({ ...valid, secret: keyBytes.toString("base64") })).toBe(true);
  });

  it("rejects a changed body", () => {
    expect(verifyStandardWebhook({ ...valid, body: body.replace("123456", "654321") })).toBe(false);
  });

  it("rejects a different key", () => {
    expect(
      verifyStandardWebhook({
        ...valid,
        signature: sign(`${id}.${now}.${body}`, Buffer.from("ffffffffffffffffffffffffffffffff"))
      })
    ).toBe(false);
  });

  it("rejects old and future timestamps", () => {
    expect(verifyStandardWebhook({ ...valid, nowSeconds: now + 301 })).toBe(false);
    expect(verifyStandardWebhook({ ...valid, nowSeconds: now - 301 })).toBe(false);
  });

  it("fails closed on missing pieces", () => {
    expect(verifyStandardWebhook({ ...valid, secret: undefined })).toBe(false);
    expect(verifyStandardWebhook({ ...valid, secret: "v1,whsec_" })).toBe(false);
    expect(verifyStandardWebhook({ ...valid, id: null })).toBe(false);
    expect(verifyStandardWebhook({ ...valid, timestamp: null })).toBe(false);
    expect(verifyStandardWebhook({ ...valid, timestamp: "soon" })).toBe(false);
    expect(verifyStandardWebhook({ ...valid, signature: null })).toBe(false);
    expect(verifyStandardWebhook({ ...valid, signature: valid.signature.replace("v1,", "v2,") })).toBe(false);
  });
});
