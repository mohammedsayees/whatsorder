import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chatCommand, emptyChatOrder, isChatYes, looksLikeChatOrder, matchChatItem, normalizeChatText, parseChatOrderText,
  type ChatMenu, type ChatOrderDraft
} from "./whatsapp-order-cart";
import { deterministicChatParse, runChatOrderTurn, type ChatParseResult, type ChatTurn, type ChatTurnContext } from "./whatsapp-order-flow";
import { CHAT_COPY, detectChatLang, resolveChatLang, type ChatError } from "./whatsapp-order-i18n";
import { buildParserCatalog, validateParserOutput } from "./whatsapp-order-parser";
import { describeParse } from "./whatsapp-order-review";
import type { MenuItem, MenuOptionCatalog, MenuWithCategories } from "./types";

const item = (id: string, name: string, name_ar: string | null, price: number) =>
  ({ id, name, name_ar, price, category_id: "cat", is_available: true }) as MenuItem;
const items = [item("tea", "Karak", "كَرَك", 2), item("smash", "Smash Burger", "برجر سماش", 18), item("water", "Water", "ماء", 1)];
const catalog = {
  groups: [{ id: "size", name: "Size", name_ar: "الحجم", min_select: 1, max_select: 1 }],
  options: [
    { id: "small", group_id: "size", name: "Small", name_ar: "صغير", price_delta: 0, is_available: true, display_order: 0 },
    { id: "large", group_id: "size", name: "Large", name_ar: "كبير", price_delta: 1.5, is_available: true, display_order: 1 }
  ],
  links: [{ menu_item_id: "tea", group_id: "size", display_order: 0 }]
} as unknown as MenuOptionCatalog;
const menu: ChatMenu = { items, catalog };

const T0 = Date.parse("2026-11-12T10:00:00Z");
let tokens = 0;
function ctx(text: string, draft: ChatOrderDraft, o: Partial<ChatTurnContext> & { parseResult?: ChatParseResult } = {}): ChatTurnContext {
  return {
    text, draft, now: T0, sentAtMs: null, profileName: "Sara", menu,
    pricingMenu: { categories: [], items } as unknown as MenuWithCategories,
    restaurant: { name: "Cafe", open: true, minimumOrder: 0 },
    money: v => `AED ${v.toFixed(2)}`, menuLink: "https://x/r/cafe", handoffMessage: "Staff will help",
    languageMode: "customer", newToken: () => (++tokens).toString(16).padStart(12, "0"),
    parse: async t => o.parseResult ?? deterministicChatParse(t, menu),
    ...o
  };
}
const handled = (turn: ChatTurn) => { if (!turn.handled) throw new Error("not handled"); return turn; };
const say = async (text: string, draft: ChatOrderDraft, o: Parameters<typeof ctx>[2] = {}) => handled(await runChatOrderTurn(ctx(text, draft, o)));

describe("Arabic text handling", () => {
  it("unifies Arabic spelling variants on both sides", () => {
    expect(normalizeChatText("أبغى كَرَك")).toBe("ابغي كرك");
    expect(normalizeChatText("قهوةٌ")).toBe("قهوه");
    expect(normalizeChatText("٢ كرك، ١ ماء")).toBe("2 كرك, 1 ماء");
    expect(matchChatItem("كرك", items).map(i => i.id)).toEqual(["tea"]);
  });

  it("parses Arabic orders, quantity words and commands", () => {
    const parsed = parseChatOrderText("ابي 2 كرك و ماء", items);
    expect(!("error" in parsed) && parsed.segments.map(s => [s.matches[0]?.id, s.quantity])).toEqual([["tea", 2], ["water", 1]]);
    const words = parseChatOrderText("ثلاث كرك", items);
    expect(!("error" in words) && words.segments[0].quantity).toBe(3);
    expect(chatCommand("منيو 2")).toEqual({ kind: "menu", page: 2 });
    expect(chatCommand("السلة")).toEqual({ kind: "cart" });
    expect(chatCommand("إلغاء")).toEqual({ kind: "clear" });
    expect(chatCommand("طلب جديد")).toEqual({ kind: "new_order" });
  });

  it("routes Arabic orders to ordering and Arabic questions to the receptionist", () => {
    for (const text of ["ابي 2 كرك", "كرك", "احذف كرك", "خليها 3 كرك"]) expect(looksLikeChatOrder(text, items)).toBe(true);
    for (const text of ["كم سعر الكرك؟", "متى تفتحون", "شكراً", "مرحبا", "وين موقعكم"]) expect(looksLikeChatOrder(text, items)).toBe(false);
  });

  it("accepts Arabic confirmations as strictly as English ones", () => {
    for (const text of ["نعم", "أيوه", "موافق", "أكد الطلب"]) expect(isChatYes(text)).toBe(true);
    for (const text of ["تمام", "أكيد", "ok", "نعم بس زيد ماء"]) expect(isChatYes(text)).toBe(false);
  });
});

describe("reply language", () => {
  it("follows the setting, or the customer's script in customer mode", () => {
    expect(detectChatLang("ابي كرك")).toBe("ar");
    expect(detectChatLang("2 karak")).toBe("en");
    expect(detectChatLang("2")).toBeNull();
    expect(resolveChatLang("customer", "2", "ar")).toBe("ar");
    expect(resolveChatLang("customer", "karak", "ar")).toBe("en");
    expect(resolveChatLang("arabic", "karak", undefined)).toBe("ar");
    expect(resolveChatLang("english", "كرك", undefined)).toBe("en");
    expect(resolveChatLang("malayalam", "karak", undefined)).toBe("en");
  });

  it("has every message and error in both languages", () => {
    expect(Object.keys(CHAT_COPY.ar).sort()).toEqual(Object.keys(CHAT_COPY.en).sort());
    const errors: ChatError[] = [
      { code: "shape" }, { code: "quantity_whole" }, { code: "quantity_range" }, { code: "not_found", query: "x" },
      { code: "remove_ambiguous", names: ["a", "b"] }, { code: "set_ambiguous", name: "a" }, { code: "cart_limit" }, { code: "item_unavailable" }
    ];
    for (const error of errors) {
      expect(CHAT_COPY.ar.error(error)).toMatch(/[؀-ۿ]/);
      expect(CHAT_COPY.en.error(error)).toMatch(/[A-Za-z]/);
    }
  });

  it("runs a whole Arabic order with Arabic menu names, and confirms with نعم", async () => {
    const asked = await say("ابي 2 كرك", emptyChatOrder());
    expect(asked.reply).toContain("كَرَك — الحجم، اختر واحداً:\n1) صغير\n2) كبير (+AED 1.50)");
    expect(asked.next.lang).toBe("ar");
    const quoted = await say("2", asked.next);
    expect(quoted.reply).toContain("طلب سفري باسم Sara");
    expect(quoted.reply).toContain("2 × كَرَك (كبير) — AED 7.00");
    expect(quoted.reply).toContain("الإجمالي: AED 7.00");
    expect(quoted.reply).toContain("أرسل «نعم» خلال 10 دقائق");
    const confirmed = await say("نعم", quoted.next, { now: T0 + 30_000 });
    expect(confirmed.confirm).toBe(true);
    expect(confirmed.next).toBe(quoted.next);
  });

  it("keeps the conversation language for messages without letters, and honours a fixed setting", async () => {
    const arabic = await say("ابي ماء", emptyChatOrder());
    const answered = await say("نعم", arabic.next, { now: T0 + 1000 });
    expect(answered.reply).toContain("طلب سفري عبر واتساب");
    const english = await say("ابي ماء", emptyChatOrder(), { languageMode: "english" });
    expect(english.reply).toContain("Takeaway order for Sara");
    const fixedArabic = await say("1 water", emptyChatOrder(), { languageMode: "arabic" });
    expect(fixedArabic.reply).toContain("طلب سفري باسم Sara");
  });

  it("answers Arabic errors and fallbacks in Arabic", async () => {
    expect((await say("ابي شاورما", emptyChatOrder())).reply).toContain("لم أجد «شاورما» في القائمة");
    expect((await say("ابي 30 كرك", emptyChatOrder())).reply).toContain("اختر كمية من 1 إلى 25");
    const menuReply = await say("منيو", emptyChatOrder());
    expect(menuReply.reply).toContain("كَرَك — AED 2.00");
    expect(menuReply.reply).toContain("القائمة الكاملة: https://x/r/cafe");
  });
});

describe("changing a quantity", () => {
  async function cartWith() {
    const quoted = (await say("1 smash burger", emptyChatOrder())).next;
    return (await say("2 water", quoted)).next;
  }

  it("parses the supported phrasings", () => {
    for (const [text, quantity] of [["make it 3 smash burger", 3], ["change smash burger to 1", 1], ["only 2 water", 2], ["خليها 4 ماء", 4], ["make it 0 water", 0]] as const) {
      const parsed = deterministicChatParse(text, menu);
      expect(parsed).toMatchObject({ kind: "set", lines: [{ quantity }] });
    }
    expect(deterministicChatParse("make it 26 water", menu)).toEqual({ kind: "error", error: { code: "quantity_range" } });
  });

  it("sets the total instead of adding, and re-quotes", async () => {
    const draft = await cartWith();
    const changed = await say("make it 3 smash burger", draft);
    expect(changed.next.cart.map(i => [i.item_id, i.quantity])).toEqual([["smash", 3], ["water", 2]]);
    expect(changed.reply).toContain("Total: AED 56.00");
    expect(changed.next.token).not.toBe(draft.token);
  });

  it("removes at zero and explains when the item is not in the order", async () => {
    const draft = await cartWith();
    expect((await say("make it 0 water", draft)).next.cart.map(i => i.item_id)).toEqual(["smash"]);
    const missing = await say("make it 0 karak", draft);
    expect(missing.reply).toContain("Karak is not in your order");
    expect(missing.next.cart).toEqual(draft.cart);
  });

  it("adds an item that is not in the order yet, asking for required options", async () => {
    const draft = await cartWith();
    const asked = await say("make it 2 karak", draft);
    expect(asked.reply).toContain("Karak — Size, choose one");
    const quoted = await say("small", asked.next);
    expect(quoted.next.cart.find(i => i.item_id === "tea")?.quantity).toBe(2);
  });

  it("does not guess between configurations of the same item", async () => {
    let draft = (await say("1 karak", emptyChatOrder())).next;
    draft = (await say("small", draft)).next;
    draft = (await say("1 karak", draft)).next;
    draft = (await say("large", draft)).next;
    expect(draft.cart.filter(i => i.item_id === "tea")).toHaveLength(2);
    const turn = await say("make it 3 karak", draft);
    expect(turn.reply).toContain("Karak is in your order with different options");
    expect(turn.next.cart).toEqual(draft.cart);
  });

  it("keeps cart limits", async () => {
    const draft = await cartWith();
    const many = { ...draft, cart: draft.cart.map(i => (i.item_id === "water" ? { ...i, quantity: 25 } : i)) };
    const full = { ...many, cart: [...many.cart, ...Array.from({ length: 3 }, (_, n) => ({ item_id: `x${n}`, name: "X", price: 1, quantity: 25 }))] };
    expect((await say("make it 25 smash burger", full)).reply).toContain("100 items in total");
  });

  it("validates Gemini quantity changes: zero only for set, ids only from the menu", () => {
    const { aliases } = buildParserCatalog(menu);
    const line = (l: Record<string, unknown>) => ({ query: "water", item_id: "i2", candidate_item_ids: [], quantity: 1, option_ids: [], note: "", ...l });
    expect(validateParserOutput({ intent: "set", lines: [line({ quantity: 0 })] }, "no water", aliases).result)
      .toEqual({ kind: "set", lines: [{ item_id: "water", query: "water", quantity: 0 }] });
    expect(validateParserOutput({ intent: "order", lines: [line({ quantity: 0 })] }, "water", aliases).outcome).toBe("error");
    expect(validateParserOutput({ intent: "set", lines: [line({ item_id: "i99" })] }, "water", aliases).outcome).toBe("rejected");
    expect(validateParserOutput({ intent: "set", lines: [line({ quantity: -1 })] }, "water", aliases).outcome).toBe("error");
  });
});

describe("review page and migration", () => {
  const names = { items: new Map([["water", "Water"]]), options: new Map<string, string>() };
  it("describes quantity changes and both error formats", () => {
    expect(describeParse({ kind: "set", lines: [{ item_id: "water", query: "", quantity: 3 }] }, names)).toBe("Set Water to 3");
    expect(describeParse({ kind: "set", lines: [{ item_id: "water", query: "", quantity: 0 }] }, names)).toBe("Remove Water");
    expect(describeParse({ kind: "error", error: { code: "quantity_range" } }, names)).toContain("Choose a quantity from 1 to 25");
    expect(describeParse({ kind: "error", message: "legacy text" }, names)).toBe("legacy text");
    expect(describeParse({ kind: "error" }, names)).toBe("—");
  });

  it("localizes only the two command replies, keeping the v1 guarantees", () => {
    const migration = readFileSync(new URL("../../supabase/migrations/20261114090000_whatsapp_chat_order_language.sql", import.meta.url), "utf8");
    const v1 = readFileSync(new URL("../../supabase/migrations/20261113090000_whatsapp_chat_ordering_v1.sql", import.meta.url), "utf8");
    expect(migration).toContain("arabic := coalesce(draft.state->>'lang', '') = 'ar';");
    for (const guarantee of [
      "if draft.revision <> expected_revision then return jsonb_build_object('conflict',true); end if;",
      "not public.whatsapp_chat_line_is_current(target_restaurant_id, line)",
      "update public.orders set payment_method=null, source='whatsapp_chat'",
      "s.chat_ordering_mode='everyone'",
      "'wa-cart:'||target_conversation_id::text||':'||(draft.state->>'token')"
    ]) {
      expect(v1).toContain(guarantee);
      expect(migration).toContain(guarantee);
    }
    expect(migration).toContain("revoke all on function public.apply_whatsapp_order_command(uuid,uuid,text,integer,jsonb,text,boolean,boolean) from public,anon,authenticated");
    expect(migration).not.toContain("security definer");
  });
});
