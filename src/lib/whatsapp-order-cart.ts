// Pure helpers for WhatsApp chat ordering. No I/O, no model calls: every
// identifier, option and quantity that reaches a cart is checked here against
// the live public menu. Prices shown to customers come only from
// verifyCartAgainstMenu (see whatsapp-order-flow.ts).
import { cartLineKey, configuredUnitPrice } from "@/lib/cart-line";
import type { CartLine, CartLineOption, MenuItem, MenuOption, MenuOptionCatalog, MenuOptionGroup } from "@/lib/types";
import { CHAT_COPY, type ChatError, type ChatLang } from "@/lib/whatsapp-order-i18n";

export const QUOTE_TTL_MS = 10 * 60_000;
export const MAX_LINES = 20;
export const MAX_QUANTITY = 25;
export const MAX_TOTAL_QUANTITY = 100;
export const MAX_NOTE_LENGTH = 120;

export type ChatOptionPick = { option_id: string; group_id: string };

/** A requested line still waiting for the customer: an item choice or required options. */
export type PendingChatLine = {
  /** null while the customer chooses between `candidates`. */
  item_id: string | null;
  candidates: string[];
  quantity: number;
  picks: ChatOptionPick[];
  note?: string;
};

export type ChatLineNote = { item_id: string; text: string };

export type ChatOrderDraft = {
  cart: CartLine[];
  name: string;
  /** Server-side quote token: present only while the latest quote is confirmable. */
  token: string;
  quotedAt: string | null;
  orderId: string | null;
  pending?: PendingChatLine[];
  awaitingName?: boolean;
  noteLines?: ChatLineNote[];
  /** Derived from noteLines; read by apply_whatsapp_order_command. */
  notes?: string;
  /** Reply language for this conversation; also read by apply_whatsapp_order_command. */
  lang?: ChatLang;
};

export type ChatMenu = { items: MenuItem[]; catalog: MenuOptionCatalog };

export const emptyChatOrder = (): ChatOrderDraft => ({ cart: [], name: "", token: "", quotedAt: null, orderId: null });

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;
/**
 * Lower-cased, whitespace-collapsed text for matching. Arabic spelling
 * variants customers type interchangeably are unified (alef/hamza forms, ya,
 * taa marbuta, vowel marks, tatweel) on both the message and menu names.
 */
export function normalizeChatText(text: string) {
  return text
    .normalize("NFKC")
    .replace(ARABIC_DIGITS, d => String((d.charCodeAt(0) & 0xf) % 10))
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/،/g, ",")
    .toLowerCase()
    .replace(/[.!?؟]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchChatItem(text: string, items: MenuItem[]) {
  const query = normalizeChatText(text);
  if (!query) return [];
  const exact = items.filter(i => [i.name, i.name_ar].some(n => n && normalizeChatText(n) === query));
  if (exact.length || query.length < 3) return exact;
  // Partial matches start at a word: "burger" → "Smash Burger", but "hi" never → "Chicken".
  return items.filter(i => [i.name, i.name_ar].some(n => n && ` ${normalizeChatText(n)}`.includes(` ${query}`)));
}

// ---------------------------------------------------------------------------
// Deterministic parsing (fast path)

// Arabic patterns are written in normalizeChatText's normalized spelling (ابغى → ابغي).
const AR_LEAD = "ابي|ابغي|ابا|اريد|بغيت|عطني|اعطني|ممكن|ضيف|اضف";
const LEAD = new RegExp(`^(?:hi|hello|hey|salam|مرحبا|السلام عليكم)?[, ]*(?:please )?(?:i would like(?: to order)?|i'd like(?: to order)?|i want(?: to order)?|can i (?:have|get|order)|could i (?:have|get)|please add|add|order|give me|get me|${AR_LEAD})\\s+`);
const TRAIL = /\s+(?:please|pls|plz|thanks|thank you|لو سمحت|من فضلك)$/;
const WORD_QUANTITIES: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  واحد: 1, اثنين: 2, اثنان: 2, ثنين: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5
};
const REMOVE = /^(?:remove|delete|احذف|حذف|شيل|ازل|ازاله)\s+/;
const SET_VERBS = "make it|make that|change it to|change that to|set|update|خليها|خليه|خلي|خلها|خله|غيرها|غيره";
// "make it 3 karak", "change karak to 3", "only 1 karak", "خليها 3 كرك". Quantity 0 removes.
const SET_PATTERNS: Array<{ pattern: RegExp; quantity: number; query: number }> = [
  { pattern: new RegExp(`^(?:${SET_VERBS})\\s+(\\d+)\\s+(.+)$`), quantity: 1, query: 2 },
  { pattern: /^(?:change|update|make|set)\s+(.+?)\s+to\s+(\d+)$/, quantity: 2, query: 1 },
  { pattern: /^(?:only|just|بس|فقط)\s+(\d+)\s+(.+)$/, quantity: 1, query: 2 }
];

export type ParsedChatSegment = { query: string; quantity: number; matches: MenuItem[] };
export type ParsedChatOrder = { op: "add" | "remove" | "set"; segments: ParsedChatSegment[] };

function splitQuantity(segment: string): { quantity: number; query: string } | null {
  let match = segment.match(/^(\d+)\s*(?:x\s*)?(.+)$/);
  if (match) return { quantity: Number(match[1]), query: match[2].trim() };
  match = segment.match(/^(.+?)\s*(?:x\s*|\*\s*)(\d+)$/);
  if (match) return { quantity: Number(match[2]), query: match[1].trim() };
  match = segment.match(/^(\p{L}+)\s+(.+)$/u);
  if (match && WORD_QUANTITIES[match[1]] !== undefined) return { quantity: WORD_QUANTITIES[match[1]], query: match[2] };
  return segment ? { quantity: 1, query: segment } : null;
}

/** Splits "2 karak, 1 smash burger" into segments and matches each against the public menu. */
export function parseChatOrderText(text: string, items: MenuItem[]): ParsedChatOrder | { error: ChatError } {
  const whole = normalizeChatText(text.replace(/\n/g, ",")).replace(TRAIL, "");
  for (const { pattern, quantity, query } of SET_PATTERNS) {
    const match = whole.match(pattern);
    if (!match) continue;
    const amount = Number(match[quantity]);
    if (!Number.isInteger(amount) || amount < 0 || amount > MAX_QUANTITY) return { error: { code: "quantity_range" } };
    return { op: "set", segments: [{ query: match[query].trim(), quantity: amount, matches: matchChatItem(match[query], items) }] };
  }
  const normalized = whole.replace(LEAD, "");
  const remove = REMOVE.test(normalized);
  const segments = normalized.replace(REMOVE, "").split(/\s+and\s+|\s*[,&+;]\s*|\s+و\s+/)
    .map(s => s.trim()).filter(Boolean);
  if (!segments.length || segments.length > MAX_LINES) {
    return { error: { code: "shape" } };
  }
  const parsed: ParsedChatSegment[] = [];
  for (const segment of segments) {
    // A product name may start with digits ("7up"): prefer a whole-segment match.
    const whole = matchChatItem(segment, items);
    const split = splitQuantity(segment);
    if (!split) return { error: { code: "quantity_whole" } };
    const exactWhole = whole.length === 1 &&
      [whole[0].name, whole[0].name_ar].some(n => n && normalizeChatText(n) === segment);
    const quantity = exactWhole ? 1 : split.quantity;
    const query = exactWhole ? segment : split.query;
    if (!remove && (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY)) {
      return { error: { code: "quantity_range" } };
    }
    parsed.push({ query, quantity, matches: exactWhole ? whole : matchChatItem(query, items) });
  }
  return { op: remove ? "remove" : "add", segments: parsed };
}

const ORDER_COMMAND = /^(?:menu(?: \d+)?|order|takeaway|take away|new order|i want to order|i'd like to order|i would like to order|can i order|place an order|order please|i want to place an order|(?:منيو|القائمه|قائمه)(?: \d+)?|اطلب|طلب|طلب جديد|ابي اطلب|ابغي اطلب|اريد اطلب|سفري)$/;
const ORDER_VERB = new RegExp(`^(?:(?:hi|hello|hey|salam|مرحبا)[, ]+)?(?:please )?(?:i would like|i'd like|i want|i need|can i (?:have|get|order)|could i (?:have|get)|please add|add|order|give me|get me|remove|delete|change|only|just|${SET_VERBS}|${AR_LEAD}|احذف|حذف|شيل|بس|فقط)(?:\\s|$)`);
const SMALL_TALK = /^(?:hi|hello|hey|salam|salaam|good (?:morning|afternoon|evening)|thanks|thank you|thx|ok|okay|no|nope|bye|مرحبا|السلام عليكم|شكرا|ഹായ്|ഹലോ)$/;
const QUESTION = /^(?:how|what|when|where|why|which|who|do you|does|is|are|can you|could you|will|any|كم|متي|وين|فين|هل|ليش|ليه|شو|ايش|وش|اين)(?:\s|$)|\?$|؟$/;

/**
 * Whether a message should go to chat ordering rather than the receptionist.
 * Questions ("how much is karak?") stay with the receptionist; item lists,
 * order verbs and ordering commands come here.
 */
export function looksLikeChatOrder(text: string, items: MenuItem[]): boolean {
  const normalized = normalizeChatText(text);
  if (!normalized || SMALL_TALK.test(normalized)) return false;
  if (ORDER_COMMAND.test(normalized)) return true;
  if (QUESTION.test(text.trim()) || QUESTION.test(normalized)) {
    return /^(?:can i (?:have|get|order)|could i (?:have|get))\b/.test(normalized);
  }
  if (ORDER_VERB.test(normalized) || /^\d+\s*x?\s*\p{L}/u.test(normalized)) return true;
  const parsed = parseChatOrderText(text, items);
  return !("error" in parsed) && parsed.segments.every(s => s.matches.length > 0);
}

// Matched after normalizeChatText, so Arabic forms are written normalized (أيوه → ايوه).
const YES = /^(?:yes|y|yes please|yes pls|yeah|yep|yup|confirm|confirmed|i confirm|نعم|ايوه|اي|اجل|موافق|اكد|اكد الطلب|അതെ|ശരി)$/;
export const isChatYes = (text: string) => YES.test(normalizeChatText(text));

export type ChatCommand =
  | { kind: "menu"; page: number } | { kind: "cart" } | { kind: "clear" } | { kind: "new_order" } | { kind: "order" };
/** Fixed commands, in English or Arabic. */
export function chatCommand(text: string): ChatCommand | null {
  const normalized = normalizeChatText(text);
  const menu = normalized.match(/^(?:menu|منيو|القائمه|قائمه)(?: (\d+))?$/);
  if (menu) return { kind: "menu", page: Math.min(100, Math.max(1, Number(menu[1] ?? 1))) };
  if (/^(?:cart|checkout|السله|سله|طلبي)$/.test(normalized)) return { kind: "cart" };
  if (/^(?:clear|cancel|الغاء|الغي|امسح)$/.test(normalized)) return { kind: "clear" };
  if (/^(?:new order|طلب جديد)$/.test(normalized)) return { kind: "new_order" };
  if (/^(?:order|takeaway|take away|اطلب|طلب|سفري)$/.test(normalized)) return { kind: "order" };
  return null;
}
export function chatConfirmCode(text: string): string | null {
  return normalizeChatText(text).match(/^confirm ([a-f0-9]{6,32})$/)?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Options

type GroupView = { group: MenuOptionGroup; available: MenuOption[]; min: number; max: number };

/** Linked groups for an item, in link order, with available options and effective limits (as verifyCartAgainstMenu). */
export function itemOptionGroups(itemId: string, catalog: MenuOptionCatalog): GroupView[] {
  const groups = new Map(catalog.groups.map(g => [g.id, g]));
  return [...catalog.links].filter(l => l.menu_item_id === itemId)
    .sort((a, b) => a.display_order - b.display_order)
    .flatMap(link => {
      const group = groups.get(link.group_id);
      if (!group) return [];
      const available = catalog.options.filter(o => o.group_id === group.id && o.is_available)
        .sort((a, b) => a.display_order - b.display_order);
      return [{ group, available, min: Math.min(Number(group.min_select), available.length),
        max: group.max_select === null ? Infinity : Number(group.max_select) }];
    });
}

/**
 * Keeps only option ids that are available and linked to the item, one per
 * option, within each group's maximum. Unknown, foreign or duplicate ids are
 * dropped and reported, never trusted.
 */
export function validateOptionPicks(itemId: string, optionIds: string[], catalog: MenuOptionCatalog):
  { picks: ChatOptionPick[]; rejected: string[] } {
  const groups = itemOptionGroups(itemId, catalog);
  const picks: ChatOptionPick[] = [];
  const rejected: string[] = [];
  for (const id of optionIds) {
    const view = groups.find(g => g.available.some(o => o.id === id));
    const count = picks.filter(p => p.group_id === view?.group.id).length;
    if (!view || picks.some(p => p.option_id === id) || count >= view.max) { rejected.push(id); continue; }
    picks.push({ option_id: id, group_id: view.group.id });
  }
  return { picks, rejected };
}

/** Fills a required group automatically when its available options are exactly what it requires. */
export function applyOptionDefaults(line: PendingChatLine, catalog: MenuOptionCatalog): PendingChatLine {
  if (!line.item_id) return line;
  const picks = [...line.picks];
  for (const view of itemOptionGroups(line.item_id, catalog)) {
    const chosen = picks.filter(p => p.group_id === view.group.id).length;
    if (view.min > 0 && chosen < view.min && view.available.length === view.min) {
      for (const option of view.available) {
        if (!picks.some(p => p.option_id === option.id)) picks.push({ option_id: option.id, group_id: view.group.id });
      }
    }
  }
  return { ...line, picks };
}

export type ChatQuestion =
  | { kind: "item"; candidates: MenuItem[] }
  | { kind: "options"; item: MenuItem; group: MenuOptionGroup; options: MenuOption[]; need: number; max: number };

/** The question blocking this pending line, or null when it can go into the cart. */
export function pendingQuestion(line: PendingChatLine, menu: ChatMenu): ChatQuestion | null {
  if (!line.item_id) {
    return { kind: "item", candidates: line.candidates.map(id => menu.items.find(i => i.id === id)).filter((i): i is MenuItem => !!i) };
  }
  const item = menu.items.find(i => i.id === line.item_id);
  if (!item) return null;
  for (const view of itemOptionGroups(item.id, menu.catalog)) {
    const chosen = line.picks.filter(p => p.group_id === view.group.id).length;
    if (chosen < view.min) {
      return { kind: "options", item, group: view.group, options: view.available, need: view.min - chosen, max: view.max - chosen };
    }
  }
  return null;
}

function pickOne<T extends { name: string; name_ar?: string | null }>(part: string, list: T[]): T | null {
  const exact = list.filter(o => [o.name, o.name_ar].some(n => n && normalizeChatText(n) === part));
  if (exact.length === 1) return exact[0];
  const partial = list.filter(o => [o.name, o.name_ar].some(n => n && normalizeChatText(n).includes(part)));
  return partial.length === 1 ? partial[0] : null;
}

/** "2", "1, 3", "1 3", "large" or "large, saffron" → the chosen entries; null when any part does not fit. */
function pickFromList<T extends { name: string; name_ar?: string | null }>(text: string, list: T[]): T[] | null {
  const normalized = normalizeChatText(text);
  if (!normalized) return null;
  const numbers = normalized.split(/\s*(?:,|\band\b|&|\s)\s*/).filter(Boolean);
  if (numbers.every(p => /^\d+$/.test(p))) {
    const chosen = numbers.map(p => list[Number(p) - 1]);
    return chosen.every(Boolean) ? chosen : null;
  }
  const whole = pickOne(normalized, list);
  if (whole) return [whole];
  const chosen = normalized.split(/\s*(?:,|\band\b|&)\s*/).filter(Boolean).map(p => pickOne(p, list));
  return chosen.length > 1 && chosen.every(Boolean) ? (chosen as T[]) : null;
}

/** Applies the customer's answer to the line's current question; null when the answer does not fit. */
export function answerPendingQuestion(text: string, line: PendingChatLine, menu: ChatMenu): PendingChatLine | null {
  const question = pendingQuestion(line, menu);
  if (!question) return line;
  if (question.kind === "item") {
    const chosen = pickFromList(text, question.candidates);
    if (!chosen || chosen.length !== 1) return null;
    return applyOptionDefaults({ ...line, item_id: chosen[0].id, candidates: [] }, menu.catalog);
  }
  const chosen = pickFromList(text, question.options);
  if (!chosen || new Set(chosen.map(o => o.id)).size !== chosen.length) return null;
  if (chosen.length < question.need || chosen.length > question.max) return null;
  if (chosen.some(o => line.picks.some(p => p.option_id === o.id))) return null;
  return { ...line, picks: [...line.picks, ...chosen.map(o => ({ option_id: o.id, group_id: o.group_id }))] };
}

/** Arabic name when replying in Arabic and the menu has one. */
export const localName = (entry: { name: string; name_ar?: string | null }, lang: ChatLang) =>
  lang === "ar" && entry.name_ar ? entry.name_ar : entry.name;

export function describeQuestion(question: ChatQuestion, money: (n: number) => string, lang: ChatLang = "en"): string {
  const copy = CHAT_COPY[lang];
  if (question.kind === "item") {
    return copy.chooseItem(question.candidates.map((i, n) => `${n + 1}) ${localName(i, lang)} — ${money(Number(i.price))}`).join("\n"));
  }
  const options = question.options.map((o, n) =>
    `${n + 1}) ${localName(o, lang)}${Number(o.price_delta) ? ` (${Number(o.price_delta) > 0 ? "+" : "−"}${money(Math.abs(Number(o.price_delta)))})` : ""}`);
  return copy.chooseOptions(localName(question.item, lang), localName(question.group, lang), copy.how(question.need, question.max),
    options.join("\n"), !(question.need === 1 && question.max === 1));
}

// ---------------------------------------------------------------------------
// Cart

function toCartLine(line: PendingChatLine, menu: ChatMenu): CartLine | null {
  const item = menu.items.find(i => i.id === line.item_id);
  if (!item) return null;
  const optionsById = new Map(menu.catalog.options.map(o => [o.id, o]));
  const options: CartLineOption[] = line.picks.flatMap(p => {
    const option = optionsById.get(p.option_id);
    return option ? [{ option_id: option.id, group_id: option.group_id, name: option.name,
      name_ar: option.name_ar ?? null, price_delta: Number(option.price_delta) }] : [];
  });
  // Indicative only: the quote re-prices every line with verifyCartAgainstMenu.
  return { item_id: item.id, name: item.name, name_ar: item.name_ar ?? null,
    price: configuredUnitPrice(Number(item.price), options), quantity: line.quantity,
    ...(options.length ? { options } : {}) };
}

export function withinCartLimits(cart: CartLine[]) {
  return cart.length <= MAX_LINES && cart.every(i => i.quantity <= MAX_QUANTITY) &&
    cart.reduce((sum, i) => sum + i.quantity, 0) <= MAX_TOTAL_QUANTITY;
}

/** Adds resolved lines to the cart (same configuration → same line); the cart is unchanged on error. */
export function mergeIntoCart(cart: CartLine[], lines: PendingChatLine[], menu: ChatMenu):
  { cart: CartLine[]; error?: never } | { error: ChatError; cart?: never } {
  const next = cart.map(i => ({ ...i }));
  for (const line of lines) {
    const cartLine = toCartLine(line, menu);
    if (!cartLine) return { error: { code: "item_unavailable" } };
    const existing = next.find(i => cartLineKey(i) === cartLineKey(cartLine));
    if (existing) existing.quantity += cartLine.quantity;
    else next.push(cartLine);
  }
  return withinCartLimits(next) ? { cart: next } : { error: { code: "cart_limit" } };
}

/** Keeps notes only for items still in the cart and derives the order note text. */
export function syncNotes(draft: ChatOrderDraft): ChatOrderDraft {
  const ids = new Set(draft.cart.map(i => i.item_id));
  const noteLines = (draft.noteLines ?? []).filter(n => ids.has(n.item_id)).slice(0, MAX_LINES);
  const names = new Map(draft.cart.map(i => [i.item_id, i.name]));
  const notes = noteLines.map(n => `${names.get(n.item_id)}: ${n.text}`).join("; ").slice(0, 500);
  const next: ChatOrderDraft = { ...draft };
  delete next.noteLines;
  delete next.notes;
  return noteLines.length ? { ...next, noteLines, notes } : next;
}

/** Plain-text note: control/format characters removed, whitespace collapsed, capped. */
export function sanitizeChatNote(raw: unknown): string {
  return typeof raw === "string"
    ? raw.normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE_LENGTH)
    : "";
}

/** WhatsApp profile names are customer-controlled display text: keep a short, printable name with a letter. */
export function sanitizeCustomerName(raw: string | null | undefined): string {
  const name = (raw ?? "").normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/g, " ").trim().slice(0, 60).trim();
  return /\p{L}/u.test(name) ? name : "";
}

// ---------------------------------------------------------------------------
// Confirmation

export type ChatConfirmCheck = "ok" | "ordered" | "pending" | "no_quote" | "wrong_code" | "expired" | "stale";

/**
 * A YES (or CONFIRM code) confirms only the latest quote: one that is live,
 * unexpired, has no open question, and was issued before the YES was sent.
 * Any cart edit clears the token, so a YES can never confirm an edited cart.
 */
export function checkChatConfirmation(draft: ChatOrderDraft, input: { now: number; sentAtMs: number | null; code?: string | null }): ChatConfirmCheck {
  if (draft.orderId) return "ordered";
  if (draft.pending?.length || draft.awaitingName) return "pending";
  if (!draft.token || !draft.quotedAt || !draft.cart.length || !draft.name) return "no_quote";
  if (input.code && input.code !== draft.token.toLowerCase()) return "wrong_code";
  const quotedAt = Date.parse(draft.quotedAt);
  const age = input.now - quotedAt;
  if (!Number.isFinite(quotedAt) || age < 0 || age > QUOTE_TTL_MS) return "expired";
  // WhatsApp timestamps are whole seconds: allow that rounding, nothing more.
  if (input.sentAtMs !== null && input.sentAtMs + 1000 < quotedAt) return "stale";
  return "ok";
}

/** Unix-seconds connector timestamp → ms, or null when absent or implausible. */
export function chatSentAtMs(timestamp: string | undefined, now: number): number | null {
  const seconds = Number(timestamp);
  if (!timestamp || !Number.isFinite(seconds) || seconds <= 0) return null;
  const ms = seconds * 1000;
  return ms > now + 5 * 60_000 ? null : ms;
}
