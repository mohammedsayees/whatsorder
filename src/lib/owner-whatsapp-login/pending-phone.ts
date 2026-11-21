// lib/owner-whatsapp-login/pending-phone.ts
//
// The code screen remembers which phone it is waiting on, and when the last
// code was requested (for the Resend countdown), in one httpOnly cookie.
// Pure, so it is unit-testable.

import { isE164 } from "@/lib/owner-whatsapp-login/phone";

export type PendingOwnerLoginPhone = { phoneE164: string; requestedAtMs: number };

export function encodeOwnerLoginPhoneCookie(phoneE164: string, requestedAtMs: number): string {
  return `${phoneE164}|${Math.floor(requestedAtMs)}`;
}

export function decodeOwnerLoginPhoneCookie(value: string | null | undefined): PendingOwnerLoginPhone | null {
  if (!value) {
    return null;
  }
  const [phoneE164, requestedAt] = value.split("|");
  const requestedAtMs = Number(requestedAt);
  if (!isE164(phoneE164) || !Number.isFinite(requestedAtMs) || requestedAtMs <= 0) {
    return null;
  }
  return { phoneE164, requestedAtMs };
}

/** Seconds until Resend is allowed again (never negative). */
export function resendSecondsLeft(requestedAtMs: number, cooldownSeconds: number, nowMs = Date.now()): number {
  return Math.max(0, Math.ceil((requestedAtMs + cooldownSeconds * 1000 - nowMs) / 1000));
}
