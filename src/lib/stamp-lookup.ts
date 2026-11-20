// lib/stamp-lookup.ts
//
// Counter stamp-card lookup: staff type the customer's number and see their
// stamp progress. Exact match on a complete number only (no partial search),
// so the counter screen can't be used to browse the customer list. Pure
// helpers, safe for client components.

import { normalizeCustomerPhone } from "@/lib/whatsapp";

const MIN_DIGITS = 9;
const MAX_DIGITS = 15;

/**
 * The canonical phone to look up, or null while the number is incomplete
 * or implausible. Uses the same normalization as saving the order.
 */
export function stampLookupPhone(raw: string, phoneCountryCode = "971"): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < MIN_DIGITS) {
    return null;
  }
  const phone = normalizeCustomerPhone(raw, phoneCountryCode);
  // A UAE mobile is complete only at 971 + 9 digits.
  if (phoneCountryCode === "971" && phone.startsWith("971") && phone.length !== 12) {
    return null;
  }
  return /^\d+$/.test(phone) && phone.length >= MIN_DIGITS + 1 && phone.length <= MAX_DIGITS
    ? phone
    : null;
}

/** First name only, so the counter can greet the customer. */
export function stampGreetingName(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first || /^(walk-in|customer)$/i.test(first)) {
    return null;
  }
  return first.slice(0, 40);
}

export type StampLookup =
  | { status: "off" }
  | { status: "new"; required: number; reward: string | null }
  | {
      status: "known";
      name: string | null;
      stamps: number;
      required: number;
      reward: string | null;
    };

export type StampMessage = { tone: "new" | "progress" | "ready"; text: string };

/** What the counter sees for a looked-up number (this order not yet counted). */
export function stampMessage(lookup: StampLookup): StampMessage | null {
  if (lookup.status === "off") {
    return null;
  }
  const reward = lookup.reward?.trim() || "reward";
  if (lookup.status === "new") {
    return { tone: "new", text: `New customer · first stamp today (${lookup.required} for a free ${reward})` };
  }
  const who = lookup.name ? `${lookup.name} · ` : "";
  if (lookup.stamps >= lookup.required) {
    return { tone: "ready", text: `${who}Reward ready: free ${reward} (${lookup.stamps}/${lookup.required})` };
  }
  const left = lookup.required - lookup.stamps;
  return {
    tone: "progress",
    text: `${who}${lookup.stamps}/${lookup.required} stamps · ${left} more for a free ${reward}`
  };
}
