import { describe, expect, it } from "vitest";
import {
  chatConfirmCode, chatSentAtMs, checkChatConfirmation, emptyChatOrder, isChatYes, looksLikeChatOrder,
  matchChatItem, mergeIntoCart, normalizeChatText, parseChatOrderText, sanitizeChatNote, sanitizeCustomerName,
  validateOptionPicks, type ChatOrderDraft
} from "./whatsapp-order-cart";
import type { MenuItem, MenuOptionCatalog } from "./types";

const items = [
  { id: "tea", name: "Karak", name_ar: "كرك", price: 2 },
  { id: "sandwich", name: "Chicken sandwich", price: 6 },
  { id: "burger", name: "Chicken burger", price: 8 },
  { id: "smash", name: "Smash Burger", price: 18 }
] as MenuItem[];
const catalog = {
  groups: [{ id: "size", name: "Size", min_select: 1, max_select: 1 }, { id: "extra", name: "Extras", min_select: 0, max_select: 2 }],
  options: [
    { id: "small", group_id: "size", name: "Small", price_delta: 0, is_available: true, display_order: 0 },
    { id: "large", group_id: "size", name: "Large", price_delta: 1.5, is_available: true, display_order: 1 },
    { id: "saffron", group_id: "extra", name: "Saffron", price_delta: 0.5, is_available: true, display_order: 0 },
    { id: "off", group_id: "extra", name: "Gone", price_delta: 0, is_available: false, display_order: 1 },
    { id: "foreign", group_id: "other", name: "Other item's option", price_delta: 0, is_available: true, display_order: 0 }
  ],
  links: [{ menu_item_id: "tea", group_id: "size", display_order: 0 }, { menu_item_id: "tea", group_id: "extra", display_order: 1 }]
} as unknown as MenuOptionCatalog;

describe("chat order text parsing", () => {
  it("reads common quantity forms and Arabic digits", () => {
    const parsed = parseChatOrderText("I want 2 karak, smash burger x3 and two chicken sandwich", items);
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.segments.map(s => [s.matches.map(i => i.id), s.quantity])).toEqual([[["tea"], 2], [["smash"], 3], [["sandwich"], 2]]);
    expect(normalizeChatText("٢ كرك")).toBe("2 كرك");
  });

  it("does not read digits in product names as a quantity", () => {
    const menu = [...items, { id: "soda", name: "7up", price: 3 } as MenuItem];
    const one = parseChatOrderText("7up", menu);
    const two = parseChatOrderText("2 7up", menu);
    expect(!("error" in one) && one.segments[0].quantity).toBe(1);
    expect(!("error" in two) && two.segments[0]).toMatchObject({ quantity: 2, matches: [{ id: "soda" }] });
  });

  it("matches partial names only from the start of a word", () => {
    expect(matchChatItem("burger", items).map(i => i.id)).toEqual(["burger", "smash"]);
    expect(matchChatItem("hi", items)).toEqual([]);
    expect(matchChatItem("icken", items)).toEqual([]);
    expect(matchChatItem("chicken", items)).toHaveLength(2);
  });

  it("rejects out-of-range quantities", () => {
    expect(parseChatOrderText("26 karak", items)).toHaveProperty("error");
    expect(parseChatOrderText("0 karak", items)).toHaveProperty("error");
  });
});

describe("order intent routing", () => {
  it.each(["2 karak, 1 smash burger", "karak", "I want a burger", "can I have 2 karak?", "menu", "order", "remove karak", "i want to order"])(
    "sends %s to chat ordering", text => expect(looksLikeChatOrder(text, items)).toBe(true));
  it.each(["hi", "hello", "thanks", "ok", "what time do you close?", "how much is karak?", "where are you located", "is karak available?", "I'm outside", ""])(
    "leaves %s to the receptionist", text => expect(looksLikeChatOrder(text, items)).toBe(false));
});

describe("YES confirmation", () => {
  it.each(["YES", "yes!", "Yes please", "y", "confirm", "نعم"])("accepts %s", text => expect(isChatYes(text)).toBe(true));
  it.each(["ok", "yes but add tea", "yesterday", "no", "sure maybe"])("does not treat %s as YES", text => expect(isChatYes(text)).toBe(false));
  it("reads legacy confirmation codes", () => {
    expect(chatConfirmCode("CONFIRM a1b2c3d4e5f6")).toBe("a1b2c3d4e5f6");
    expect(chatConfirmCode("confirm")).toBeNull();
  });

  const now = Date.parse("2026-11-12T10:00:00Z");
  const quoted: ChatOrderDraft = { ...emptyChatOrder(), name: "Ali", token: "abc123abc123",
    quotedAt: new Date(now - 60_000).toISOString(), cart: [{ item_id: "tea", name: "Karak", price: 2, quantity: 1 }] };

  it("confirms only a live, unexpired, latest quote", () => {
    expect(checkChatConfirmation(quoted, { now, sentAtMs: now - 1000 })).toBe("ok");
    expect(checkChatConfirmation(quoted, { now, sentAtMs: null })).toBe("ok");
    expect(checkChatConfirmation(quoted, { now: now + 10 * 60_000, sentAtMs: null })).toBe("expired");
    expect(checkChatConfirmation(quoted, { now: now - 120_000, sentAtMs: null })).toBe("expired");
    expect(checkChatConfirmation({ ...quoted, token: "", quotedAt: null }, { now, sentAtMs: null })).toBe("no_quote");
    expect(checkChatConfirmation({ ...quoted, cart: [] }, { now, sentAtMs: null })).toBe("no_quote");
    expect(checkChatConfirmation({ ...quoted, name: "" }, { now, sentAtMs: null })).toBe("no_quote");
  });

  it("refuses a YES sent before the latest quote was issued", () => {
    expect(checkChatConfirmation(quoted, { now, sentAtMs: now - 5 * 60_000 })).toBe("stale");
    // Whole-second WhatsApp timestamps are tolerated.
    expect(checkChatConfirmation(quoted, { now, sentAtMs: Date.parse(quoted.quotedAt!) - 900 })).toBe("ok");
  });

  it("refuses while a question is open, after ordering, or with an old code", () => {
    expect(checkChatConfirmation({ ...quoted, pending: [{ item_id: "tea", candidates: [], quantity: 1, picks: [] }] }, { now, sentAtMs: null })).toBe("pending");
    expect(checkChatConfirmation({ ...quoted, awaitingName: true }, { now, sentAtMs: null })).toBe("pending");
    expect(checkChatConfirmation({ ...quoted, orderId: "order" }, { now, sentAtMs: null })).toBe("ordered");
    expect(checkChatConfirmation(quoted, { now, sentAtMs: null, code: "ffffffffffff" })).toBe("wrong_code");
    expect(checkChatConfirmation(quoted, { now, sentAtMs: null, code: "abc123abc123" })).toBe("ok");
  });

  it("ignores missing or future connector timestamps", () => {
    expect(chatSentAtMs("1700000000", now)).toBe(1_700_000_000_000);
    expect(chatSentAtMs(undefined, now)).toBeNull();
    expect(chatSentAtMs("abc", now)).toBeNull();
    expect(chatSentAtMs(String((now + 3_600_000) / 1000), now)).toBeNull();
  });
});

describe("option and cart validation", () => {
  it("keeps only available options linked to the item, within group limits", () => {
    expect(validateOptionPicks("tea", ["large", "saffron", "off", "foreign", "made-up", "large", "small"], catalog)).toEqual({
      picks: [{ option_id: "large", group_id: "size" }, { option_id: "saffron", group_id: "extra" }],
      rejected: ["off", "foreign", "made-up", "large", "small"]
    });
    expect(validateOptionPicks("smash", ["large"], catalog).picks).toEqual([]);
  });

  it("merges identical configurations and enforces cart limits", () => {
    const menu = { items, catalog };
    const merged = mergeIntoCart([], [
      { item_id: "tea", candidates: [], quantity: 2, picks: [{ option_id: "large", group_id: "size" }] },
      { item_id: "tea", candidates: [], quantity: 1, picks: [{ option_id: "large", group_id: "size" }] },
      { item_id: "tea", candidates: [], quantity: 1, picks: [{ option_id: "small", group_id: "size" }] }
    ], menu);
    expect(merged.cart?.map(l => [l.quantity, l.price])).toEqual([[3, 3.5], [1, 2]]);
    expect(mergeIntoCart(merged.cart!, [{ item_id: "tea", candidates: [], quantity: 25, picks: [{ option_id: "large", group_id: "size" }] }], menu))
      .toHaveProperty("error");
    expect(mergeIntoCart([], [{ item_id: "gone", candidates: [], quantity: 1, picks: [] }], menu)).toHaveProperty("error");
  });

  it("sanitizes customer-controlled names and notes", () => {
    expect(sanitizeCustomerName("  Ali‮  Hassan\u0000 ")).toBe("Ali Hassan");
    expect(sanitizeCustomerName("🙂🙂")).toBe("");
    expect(sanitizeCustomerName(null)).toBe("");
    expect(sanitizeChatNote("less\nsugar​".padEnd(400, "!"))).toHaveLength(120);
    expect(sanitizeChatNote({ price: 0 })).toBe("");
  });
});
