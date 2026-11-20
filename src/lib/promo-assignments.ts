// lib/promo-assignments.ts
//
// Pure helpers for personal vouchers (promo codes assigned to chosen
// customers). Safe for client components.

export const MAX_ASSIGNMENTS_PER_CODE = 500;
export const CUSTOMER_SEARCH_LIMIT = 20;

export interface VoucherRecipient {
  customerId: string;
  name: string | null;
  phone: string;
}

/**
 * Cleans an owner's customer search for an ilike/like filter: strips the
 * wildcard and PostgREST filter characters, collapses spaces. Returns null
 * when too short to search.
 */
export function cleanCustomerSearch(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const cleaned = raw
    .normalize("NFKC")
    .replace(/[%_*,()\\"'`:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return cleaned.length >= 2 ? cleaned : null;
}

/** Digits of a search, if it looks like (part of) a phone number. */
export function phoneDigits(search: string): string | null {
  const digits = search.replace(/\D/g, "");
  return digits.length >= 3 ? digits : null;
}

/** "+971 50 ••• 4567" style, so an owner can tell customers apart. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) {
    return digits;
  }
  return `+${digits.slice(0, Math.min(5, digits.length - 4))} ••• ${digits.slice(-4)}`;
}
