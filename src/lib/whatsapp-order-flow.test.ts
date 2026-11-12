import { describe, expect, it } from "vitest";
import { emptyChatOrder, type ChatMenu, type ChatOrderDraft } from "./whatsapp-order-cart";
import {
  deterministicChatParse, resolveRequests, runChatOrderTurn,
  type ChatItemRequest, type ChatParseResult, type ChatTurn, type ChatTurnContext
} from "./whatsapp-order-flow";
import type { MenuItem, MenuOptionCatalog, MenuWithCategories } from "./types";

const item = (id: string, name: string, price: number) =>
  ({ id, name, price, category_id: "cat", is_available: true }) as MenuItem;
const items = [
  item("tea", "Karak", 2), item("smash", "Smash Burger", 18),
  item("sandwich", "Chicken sandwich", 6), item("chburger", "Chicken burger", 8), item("water", "Water", 1)
];
const catalog = {
  groups: [
    { id: "size", name: "Size", min_select: 1, max_select: 1 },
    { id: "bottle", name: "Bottle", min_select: 1, max_select: 1 }
  ],
  options: [
    { id: "small", group_id: "size", name: "Small", price_delta: 0, is_available: true, display_order: 0 },
    { id: "large", group_id: "size", name: "Large", price_delta: 1.5, is_available: true, display_order: 1 },
    { id: "500ml", group_id: "bottle", name: "500ml", price_delta: 0, is_available: true, display_order: 0 },
    { id: "1l", group_id: "bottle", name: "1L", price_delta: 1, is_available: false, display_order: 1 }
  ],
  links: [
    { menu_item_id: "tea", group_id: "size", display_order: 0 },
    { menu_item_id: "water", group_id: "bottle", display_order: 0 }
  ]
} as unknown as MenuOptionCatalog;

const T0 = Date.parse("2026-11-12T10:00:00Z");
let tokens = 0;
type Overrides = Partial<Omit<ChatTurnContext, "menu" | "pricingMenu">> & { items?: MenuItem[]; parseResult?: ChatParseResult };
function ctx(text: string, draft: ChatOrderDraft, o: Overrides = {}): ChatTurnContext {
  const menuItems = o.items ?? items;
  const menu: ChatMenu = { items: menuItems, catalog };
  return {
    text, draft, now: T0, sentAtMs: null, profileName: "Ali", menu,
    pricingMenu: { categories: [], items: menuItems } as unknown as MenuWithCategories,
    restaurant: { name: "Cafe", open: true, minimumOrder: 0 },
    money: v => `AED ${v.toFixed(2)}`, menuLink: "https://x/r/cafe", handoffMessage: "Staff will help",
    newToken: () => (++tokens).toString(16).padStart(12, "0"),
    parse: async t => o.parseResult ?? deterministicChatParse(t, menu),
    ...o
  };
}
const handled = (turn: ChatTurn) => { if (!turn.handled) throw new Error("not handled"); return turn; };
async function say(text: string, draft: ChatOrderDraft, o: Overrides = {}) {
  return handled(await runChatOrderTurn(ctx(text, draft, o)));
}
async function quoted() {
  const asked = await say("2 karak, 1 smash burger", emptyChatOrder());
  return (await say("2", asked.next)).next;
}

describe("chat order conversation", () => {
  it("asks for required options, then quotes server-priced items with the profile name", async () => {
    const asked = await say("2 karak, 1 smash burger", emptyChatOrder());
    expect(asked.reply).toContain("Karak — Size, choose one:\n1) Small\n2) Large (+AED 1.50)");
    expect(asked.next.cart).toEqual([]);
    expect(asked.next.token).toBe("");
    const quote = await say("large", asked.next);
    expect(quote.reply).toContain("Takeaway order for Ali");
    expect(quote.reply).toContain("2 × Karak (Large) — AED 7.00");
    expect(quote.reply).toContain("Total: AED 25.00");
    expect(quote.reply).toContain("Reply YES within 10 minutes");
    expect(quote.next.token).not.toBe("");
    expect(quote.confirm).toBe(false);
  });

  it("applies a required option automatically when only one is available", async () => {
    const quote = await say("1 water", emptyChatOrder());
    expect(quote.next.cart).toEqual([expect.objectContaining({ item_id: "water", options: [expect.objectContaining({ option_id: "500ml" })] })]);
    expect(quote.next.token).not.toBe("");
  });

  it("asks which item when a name is ambiguous, and re-asks on an unclear answer", async () => {
    const asked = await say("1 chicken", emptyChatOrder());
    expect(asked.reply).toContain("Which one did you mean?\n1) Chicken sandwich");
    const unclear = await say("the nice one", asked.next);
    expect(unclear.reply).toContain("didn't catch that");
    expect(unclear.next.cart).toEqual([]);
    const chosen = await say("2", unclear.next);
    expect(chosen.next.cart).toEqual([expect.objectContaining({ item_id: "chburger", quantity: 1, price: 8 })]);
  });

  it("asks for a pickup name only when the profile has none", async () => {
    const asked = await say("1 smash burger", emptyChatOrder(), { profileName: "🙂" });
    expect(asked.reply).toContain("What name should we use for pickup?");
    expect(asked.next.token).toBe("");
    const named = await say("Sara", asked.next, { profileName: null });
    expect(named.next).toMatchObject({ name: "Sara", awaitingName: false });
    expect(named.reply).toContain("Takeaway order for Sara");
  });

  it("removes items and re-quotes", async () => {
    const draft = await quoted();
    const removed = await say("remove smash burger", draft);
    expect(removed.next.cart.map(i => i.item_id)).toEqual(["tea"]);
    expect(removed.next.token).not.toBe(draft.token);
  });

  it("leaves unmatched items out and keeps the cart unchanged", async () => {
    const draft = await quoted();
    const turn = await say("2 shawarma", draft);
    expect(turn.reply).toContain("could not find “shawarma”");
    expect(turn.next.cart).toEqual(draft.cart);
    expect(turn.next.token).toBe("");
  });

  it("hands staff requests over and keeps CLEAR local", async () => {
    const draft = await quoted();
    const staff = await say("can I talk to staff", draft);
    expect(staff).toMatchObject({ handoff: true, confirm: false });
    expect(staff.reply).toContain("Staff will help");
    expect((await say("clear", draft)).next).toMatchObject({ cart: [], token: "", name: "Ali" });
  });

  it("does not quote when the restaurant is closed or below the minimum", async () => {
    const closed = await say("1 smash burger", emptyChatOrder(), { restaurant: { name: "Cafe", open: false, minimumOrder: 0 } });
    expect(closed.next.token).toBe("");
    expect(closed.reply).toContain("unavailable right now");
    const small = await say("1 smash burger", emptyChatOrder(), { restaurant: { name: "Cafe", open: true, minimumOrder: 50 } });
    expect(small.next.token).toBe("");
    expect(small.reply).toContain("Minimum order is AED 50.00");
  });
});

describe("YES confirmation", () => {
  it("confirms the latest quote and passes the stored draft through unchanged", async () => {
    const draft = await quoted();
    const turn = await say("Yes", draft, { now: T0 + 60_000 });
    expect(turn.confirm).toBe(true);
    expect(turn.next).toBe(draft);
    expect(turn.reply).toContain("WhatsApp takeaway: Ali");
  });

  it("never confirms while a question is open", async () => {
    const asked = await say("1 karak", emptyChatOrder());
    const turn = await say("yes", asked.next);
    expect(turn.confirm).toBe(false);
    expect(turn.reply).toContain("Please answer this first");
    expect(turn.reply).toContain("Size, choose one");
  });

  it("re-quotes instead of confirming once the quote expires", async () => {
    const draft = await quoted();
    const turn = await say("yes", draft, { now: T0 + 11 * 60_000 });
    expect(turn.confirm).toBe(false);
    expect(turn.reply).toContain("That total has expired");
    expect(turn.next.token).not.toBe(draft.token);
  });

  it("refuses a YES sent before the latest quote", async () => {
    const draft = await quoted();
    const turn = await say("yes", draft, { now: T0 + 30_000, sentAtMs: T0 - 60_000 });
    expect(turn.confirm).toBe(false);
    expect(turn.next).toBe(draft);
    expect(turn.reply).toContain("earlier version of your order");
  });

  it("an edit after the quote voids it: YES then shows the new total first", async () => {
    const draft = await quoted();
    const edited = await say("1 water", draft);
    const freshToken = edited.next.token;
    const turn = await say("yes", { ...edited.next, token: "", quotedAt: null });
    expect(turn.confirm).toBe(false);
    expect(turn.reply).toContain("Nothing has been placed yet");
    expect(freshToken).not.toBe(draft.token);
  });

  it("refuses an old CONFIRM code but accepts the current one", async () => {
    const draft = await quoted();
    expect((await say("confirm ffffffffffff", draft)).confirm).toBe(false);
    expect((await say(`confirm ${draft.token}`, draft)).confirm).toBe(true);
  });

  it("re-quotes when a price changes between quote and YES", async () => {
    const draft = await quoted();
    const repriced = items.map(i => (i.id === "smash" ? { ...i, price: 20 } : i));
    const turn = await say("yes", draft, { items: repriced });
    expect(turn.confirm).toBe(false);
    expect(turn.reply).toContain("Prices or options have changed");
    expect(turn.reply).toContain("Total: AED 27.00");
  });

  it("never places a second order after one is received", async () => {
    const draft = { ...(await quoted()), orderId: "order-1" };
    for (const text of ["yes", "YES", `confirm ${draft.token}`, "2 karak"]) {
      const turn = await say(text, draft);
      expect(turn.confirm).toBe(false);
      expect(turn.next).toBe(draft);
      expect(turn.reply).toContain("order-1");
    }
  });

  it("leaves a stray YES with nothing to confirm to the receptionist", async () => {
    expect((await runChatOrderTurn(ctx("yes", emptyChatOrder()))).handled).toBe(false);
  });
});

describe("routing", () => {
  it.each(["hi", "what time do you close?", "thanks", "where are you?"])("does not take %s", async text => {
    expect((await runChatOrderTurn(ctx(text, emptyChatOrder()))).handled).toBe(false);
    expect((await runChatOrderTurn(ctx(text, await quoted()))).handled).toBe(false);
  });

  it("answers MENU with the text-ordering help and the menu link", async () => {
    const turn = await say("menu", emptyChatOrder());
    expect(turn.reply).toContain("reply YES to place the order");
    expect(turn.reply).toContain("https://x/r/cafe");
  });

  it("lets a parser decline a message as not an order", async () => {
    expect((await runChatOrderTurn(ctx("order status", emptyChatOrder(), { parseResult: { kind: "not_order" } }))).handled).toBe(false);
  });
});

describe("parser output validation", () => {
  const menu: ChatMenu = { items, catalog };
  const req = (r: Partial<ChatItemRequest>): ChatItemRequest =>
    ({ item_id: null, candidates: [], query: "x", quantity: 1, option_ids: [], note: "", ...r });

  it("rejects unknown item ids and out-of-range quantities", () => {
    expect(resolveRequests([req({ item_id: "other-tenant-item", query: "pizza" })], menu)).toHaveProperty("error");
    for (const quantity of [0, 26, 1.5, Number.NaN]) {
      expect(resolveRequests([req({ item_id: "smash", quantity })], menu)).toHaveProperty("error");
    }
  });

  it("drops foreign or unavailable options and asks for what is still required", () => {
    const resolved = resolveRequests([req({ item_id: "tea", option_ids: ["500ml", "1l", "bogus"] })], menu);
    expect(resolved).toEqual({ pending: [{ item_id: "tea", candidates: [], quantity: 1, picks: [] }], noteLines: [] });
  });

  it("keeps only menu candidates and resolves a single survivor", () => {
    const resolved = resolveRequests([req({ candidates: ["smash", "not-on-menu", "smash"] })], menu);
    expect(resolved).toMatchObject({ pending: [{ item_id: "smash", candidates: [] }] });
  });

  it("takes prices only from the menu, whatever the parser returns", async () => {
    const injected = { ...req({ item_id: "smash", quantity: 2 }), price: 0.01, name: "Free burger" } as ChatItemRequest;
    const turn = await say("2 burgers please", emptyChatOrder(), { parseResult: { kind: "add", lines: [injected] } });
    expect(turn.next.cart).toEqual([expect.objectContaining({ item_id: "smash", name: "Smash Burger", price: 18, quantity: 2 })]);
    expect(turn.reply).toContain("Total: AED 36.00");
  });

  it("keeps notes as plain capped text tied to items in the cart", async () => {
    const turn = await say("1 smash burger no onions", emptyChatOrder(), {
      parseResult: { kind: "add", lines: [req({ item_id: "smash", note: "no onions‮\nplease" })] }
    });
    expect(turn.next.notes).toBe("Smash Burger: no onions please");
    const removed = await say("remove smash burger", turn.next);
    expect(removed.next.notes).toBeUndefined();
  });
});
