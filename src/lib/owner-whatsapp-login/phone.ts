// lib/owner-whatsapp-login/phone.ts
//
// Phone handling for owner/staff WhatsApp login. Stored and compared as E.164
// ("+971501234567"). Supabase Auth keeps phones without the "+", so convert at
// that boundary only. Pure, so it is unit-testable.

import { normalizeCustomerPhone } from "@/lib/whatsapp";

const E164 = /^\+[1-9]\d{7,14}$/;

// Arabic-Indic (U+0660–0669) and Extended Arabic-Indic / Persian (U+06F0–06F9)
// digits, which phones in the UAE often type.
function toAsciiDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/**
 * Normalise what a person typed into E.164, or null when it cannot be a phone.
 * Accepts local UAE formats ("050 123 4567", "501234567"), "+971…", "00971…".
 */
export function toE164(input: string | null | undefined, phoneCountryCode = "971"): string | null {
  if (!input) {
    return null;
  }
  const ascii = toAsciiDigits(input.normalize("NFKC")).trim();
  if (!/^[+\d\s().-]+$/.test(ascii)) {
    return null;
  }
  const digits = ascii.startsWith("+")
    ? ascii.replace(/[^\d]/g, "")
    : normalizeCustomerPhone(ascii, phoneCountryCode);
  const candidate = `+${digits}`;
  return E164.test(candidate) ? candidate : null;
}

export function isE164(value: string | null | undefined): value is string {
  return Boolean(value) && E164.test(value as string);
}

/** Supabase Auth's phone format: E.164 without the "+". */
export function toSupabasePhone(e164: string): string {
  return e164.replace(/^\+/, "");
}

/** Read a phone from Supabase (with or without "+") back into E.164. */
export function fromSupabasePhone(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const candidate = `+${value.replace(/[^\d]/g, "")}`;
  return E164.test(candidate) ? candidate : null;
}

/** "+971 50 ••• 4567" — enough for staff to recognise, not enough to reuse. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/^\+/, "");
  if (digits.length < 8) {
    return e164;
  }
  return `+${digits.slice(0, 3)} ${digits.slice(3, 5)} ••• ${digits.slice(-4)}`;
}
