import { createHmac, timingSafeEqual } from "node:crypto";

export const CONNECTOR_SIGNATURE_HEADER = "x-whatsorder-signature";
export const CONNECTOR_TIMESTAMP_HEADER = "x-whatsorder-timestamp";
export const CONNECTOR_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

export function signConnectorPayload(
  body: string,
  timestamp: string,
  secret: string,
  target = ""
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${target}.${body}`)
    .digest("hex");
}

export function verifyConnectorPayload(input: {
  body: string;
  timestamp: string | null;
  signature: string | null;
  secret: string | undefined;
  target?: string;
  now?: number;
}): boolean {
  const { body, timestamp, signature, secret, target = "", now = Date.now() } = input;
  if (!secret || !timestamp || !signature || !/^\d+$/.test(timestamp)) {
    return false;
  }

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > CONNECTOR_SIGNATURE_TOLERANCE_MS) {
    return false;
  }

  const expected = signConnectorPayload(body, timestamp, secret, target);
  const receivedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}
