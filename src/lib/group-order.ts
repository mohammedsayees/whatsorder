import { cartLineKey, formatLineOptions } from "@/lib/cart-line";
import type { CustomerLanguage } from "@/lib/customer-i18n";
import type { CartLine } from "@/lib/types";

// Office group orders: shared rules for the browser and the API routes.

export const GROUP_LIMITS = {
  /** Distinct people in one group. */
  participants: 30,
  /** Lines across the whole group (an order caps at 50 lines anyway). */
  lines: 60,
  /** Lines one person may add in a single submission. */
  linesPerSubmission: 20,
  nameLength: 30
} as const;

export const GROUP_TTL_MINUTES = 120;

export type GroupStatus = "open" | "locked" | "ordered";

const TOKEN = /^[A-Za-z0-9_-]{22,64}$/;
const PARTICIPANT = /^[A-Za-z0-9_-]{16,64}$/;

export function isShareToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

export function isParticipantId(value: unknown): value is string {
  return typeof value === "string" && PARTICIPANT.test(value);
}

/** A first name only: one line, no control characters, at most 30 chars. */
export function normalizeParticipantName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, GROUP_LIMITS.nameLength)
    .trim();

  return cleaned || null;
}

export type GroupLine = {
  id: string;
  participant_name: string;
  line: CartLine;
  /** True for lines the viewer added (they may remove them). */
  mine?: boolean;
};

/** Everyone's items as one checkout cart, same configurations merged. */
export function mergeGroupLines(lines: { line: CartLine }[]): CartLine[] {
  const merged = new Map<string, CartLine>();

  for (const { line } of lines) {
    const key = cartLineKey(line);
    const existing = merged.get(key);

    if (existing) {
      const cap = existing.offer_id && existing.offer_max_quantity ? existing.offer_max_quantity : Infinity;
      merged.set(key, { ...existing, quantity: Math.min(existing.quantity + line.quantity, cap) });
    } else {
      merged.set(key, { ...line });
    }
  }

  return [...merged.values()];
}

/**
 * Per-person breakdown for the kitchen ticket, written into the order notes:
 * "Group order (2 people): Sara: 2× Karak Tea; Ahmed: 1× Zinger (Large)".
 * People appear in the order they first added something.
 */
export function buildGroupNotes(
  lines: { participant_name: string; line: CartLine }[],
  language: CustomerLanguage,
  maxLength = 900
): string {
  const byPerson = new Map<string, string[]>();

  for (const { participant_name, line } of lines) {
    const name = language === "ar" && line.name_ar ? line.name_ar : line.name;
    const options = formatLineOptions(line.options, language);
    const items = byPerson.get(participant_name) ?? [];
    items.push(`${line.quantity}× ${name}${options ? ` (${options})` : ""}`);
    byPerson.set(participant_name, items);
  }

  if (byPerson.size === 0) {
    return "";
  }

  const heading =
    language === "ar" ? `طلب جماعي (${byPerson.size} أشخاص)` : `Group order (${byPerson.size} ${byPerson.size === 1 ? "person" : "people"})`;
  const people = [...byPerson.entries()].map(([name, items]) => `${name}: ${items.join(", ")}`);
  const text = `${heading}: ${people.join("; ")}`;

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Session handoff from the group bar to the organiser's checkout. */
export const groupCheckoutKey = (restaurantSlug: string) =>
  `whatsorder-group-checkout-${restaurantSlug}`;

export type GroupCheckoutHandoff = {
  token: string;
  organiserToken?: string;
  notes: string;
  people: number;
};

export function groupLinePath(restaurantSlug: string, shareToken: string) {
  return `/r/${restaurantSlug}?group=${encodeURIComponent(shareToken)}`;
}
