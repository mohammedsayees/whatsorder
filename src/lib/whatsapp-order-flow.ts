// One WhatsApp chat-ordering turn as a pure function: message + stored draft
// in, reply + next draft out. The caller (whatsapp-ordering.ts) owns I/O, the
// revision-checked save and order creation (apply_whatsapp_order_command).
import { formatOrderItemName } from "@/lib/cart-line";
import { verifyCartAgainstMenu } from "@/lib/order-pricing";
import type { CartLine, MenuWithCategories } from "@/lib/types";
import {
  answerPendingQuestion,
  applyOptionDefaults,
  chatConfirmCode,
  checkChatConfirmation,
  describeQuestion,
  emptyChatOrder,
  isChatYes,
  looksLikeChatOrder,
  mergeIntoCart,
  normalizeChatText,
  parseChatOrderText,
  pendingQuestion,
  sanitizeChatNote,
  sanitizeCustomerName,
  syncNotes,
  validateOptionPicks,
  MAX_LINES,
  type ChatMenu,
  type ChatOrderDraft,
  type PendingChatLine
} from "@/lib/whatsapp-order-cart";

/** One requested line from a parser. Untrusted until resolveRequests checks it against the menu. */
export type ChatItemRequest = {
  item_id: string | null;
  candidates: string[];
  query: string;
  quantity: number;
  option_ids: string[];
  note: string;
};

export type ChatParseResult =
  | { kind: "add"; lines: ChatItemRequest[] }
  | { kind: "remove"; item_ids: string[] }
  | { kind: "unmatched"; queries: string[] }
  /** Not an order after all (e.g. a question): the receptionist answers it. */
  | { kind: "not_order" }
  | { kind: "error"; message: string };

export type ChatOrderParser = (text: string) => Promise<ChatParseResult>;

/** The deterministic fast path: exact or unique substring matches only. */
export function deterministicChatParse(text: string, menu: ChatMenu): ChatParseResult {
  const parsed = parseChatOrderText(text, menu.items);
  if ("error" in parsed) return { kind: "error", message: parsed.error };
  const unmatched = parsed.segments.filter(s => !s.matches.length).map(s => s.query);
  if (unmatched.length) return { kind: "unmatched", queries: unmatched };
  if (parsed.op === "remove") {
    const ambiguous = parsed.segments.find(s => s.matches.length > 1);
    if (ambiguous) {
      return { kind: "error", message: `Which item should I remove? ${ambiguous.matches.slice(0, 6).map(i => i.name).join(", ")}. Send REMOVE with the full item name. Your order has not changed.` };
    }
    return { kind: "remove", item_ids: parsed.segments.map(s => s.matches[0].id) };
  }
  return { kind: "add", lines: parsed.segments.map(s => ({
    item_id: s.matches.length === 1 ? s.matches[0].id : null,
    candidates: s.matches.length > 1 ? s.matches.slice(0, 6).map(i => i.id) : [],
    query: s.query, quantity: s.quantity, option_ids: [], note: ""
  })) };
}

export type ChatTurnContext = {
  text: string;
  draft: ChatOrderDraft;
  now: number;
  /** When the customer sent the message (connector timestamp), if known. */
  sentAtMs: number | null;
  profileName: string | null;
  menu: ChatMenu;
  /** Full menu snapshot for verifyCartAgainstMenu (items already limited to public ones). */
  pricingMenu: MenuWithCategories;
  restaurant: { name: string; open: boolean; minimumOrder: number };
  money: (amount: number) => string;
  menuLink: string;
  handoffMessage: string;
  newToken: () => string;
  parse: ChatOrderParser;
};

export type ChatTurn =
  | { handled: false }
  | { handled: true; next: ChatOrderDraft; reply: string; confirm: boolean; handoff: boolean };

export const CHAT_ORDER_HELP = "Order takeaway here by text: send items and quantities, e.g. “2 karak, 1 sandwich”. I'll reply with the total, then reply YES to place the order. Payment is due at collection. CART shows your order, REMOVE <item> removes an item, CLEAR empties it, STAFF gets a person.";
const HANDOFF = /\b(staff|human|agent|manager|person)\b|موظف|മനുഷ്യൻ/i;
const MAX_REPLY = 4000;

const clearQuote = (draft: ChatOrderDraft): ChatOrderDraft => ({ ...draft, token: "", quotedAt: null });

/** Validates parser output against the live menu. Returns pending lines, or a customer-facing error. */
export function resolveRequests(lines: ChatItemRequest[], menu: ChatMenu):
  { pending: PendingChatLine[]; noteLines: { item_id: string; text: string }[]; error?: never } | { error: string } {
  if (!lines.length || lines.length > MAX_LINES) return { error: "Send item names and quantities, for example: 2 karak, 1 sandwich." };
  const ids = new Set(menu.items.map(i => i.id));
  const pending: PendingChatLine[] = [];
  const noteLines: { item_id: string; text: string }[] = [];
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 25) {
      return { error: "Choose a quantity from 1 to 25 per item. Your order has not changed." };
    }
    const itemId = line.item_id && ids.has(line.item_id) ? line.item_id : null;
    const candidates = [...new Set(line.candidates.filter(id => ids.has(id)))].slice(0, 6);
    if (!itemId && candidates.length < 2) {
      if (candidates.length === 1) {
        pending.push(applyOptionDefaults({ item_id: candidates[0], candidates: [], quantity: line.quantity, picks: [] }, menu.catalog));
        continue;
      }
      return { error: `I could not find “${line.query.slice(0, 60)}” on the menu. Send MENU for item names, or STAFF for help. Your order has not changed.` };
    }
    const picks = itemId ? validateOptionPicks(itemId, line.option_ids, menu.catalog).picks : [];
    const note = sanitizeChatNote(line.note);
    if (itemId && note) noteLines.push({ item_id: itemId, text: note });
    pending.push(applyOptionDefaults({ item_id: itemId, candidates: itemId ? [] : candidates, quantity: line.quantity, picks,
      ...(note && !itemId ? { note } : {}) }, menu.catalog));
  }
  return { pending, noteLines };
}

export async function runChatOrderTurn(ctx: ChatTurnContext): Promise<ChatTurn> {
  const raw = ctx.text.slice(0, 2000);
  const text = normalizeChatText(raw);
  const { draft, menu, money } = ctx;
  const profileName = sanitizeCustomerName(ctx.profileName);
  const active = Boolean(draft.cart.length || draft.pending?.length || draft.awaitingName || draft.token);

  const summary = (cart: CartLine[]) => cart.length
    ? cart.map(i => `${i.quantity} × ${formatOrderItemName(i)} — ${money(i.quantity * i.price)}`).join("\n") +
      `\nTotal: ${money(cart.reduce((sum, i) => sum + i.quantity * i.price, 0))}`
    : "Your order is empty.";
  const done = (next: ChatOrderDraft, reply: string, extra: { confirm?: boolean; handoff?: boolean } = {}): ChatTurn => {
    if (reply.length > MAX_REPLY) {
      // The linked-device transport caps texts at 4096 characters. Never truncate a total or the consent text.
      return { handled: true, next: clearQuote(next), confirm: false, handoff: extra.handoff ?? false,
        reply: `This order or menu is too long for one message. Your order is saved. Send STAFF for help or use the full menu: ${ctx.menuLink}` };
    }
    return { handled: true, next, reply, confirm: extra.confirm ?? false, handoff: extra.handoff ?? false };
  };
  const ask = (next: ChatOrderDraft, prefix = ""): ChatTurn | null => {
    for (const line of next.pending ?? []) {
      const question = pendingQuestion(line, menu);
      if (question?.kind === "item" && question.candidates.length < 2) continue;
      if (question) return done(clearQuote(next), `${prefix}${describeQuestion(question, money)}`);
    }
    return null;
  };

  /** Moves resolved lines into the cart, or asks the next question. Then quotes. */
  const settle = (next: ChatOrderDraft, prefix = ""): ChatTurn => {
    const pending = next.pending ?? [];
    if (pending.length) {
      const asked = ask(next, prefix);
      if (asked) return asked;
      const merged = mergeIntoCart(next.cart, pending.filter(l => l.item_id), menu);
      if (!merged.cart) return done(clearQuote({ ...next, pending: [] }), merged.error);
      next = syncNotes({ ...next, cart: merged.cart, pending: [] });
    }
    return quote(next, prefix);
  };

  /** Issues a fresh confirmable quote when everything is in place. */
  const quote = (next: ChatOrderDraft, prefix = ""): ChatTurn => {
    next = clearQuote(next);
    if (next.pending?.length) return settle(next, prefix);
    if (!next.cart.length) return done(next, `${prefix}Your order is empty. ${CHAT_ORDER_HELP}`);
    const verified = verifyCartAgainstMenu(next.cart, ctx.pricingMenu, [], menu.catalog);
    if (!verified.ok) return done(next, `${prefix}${verified.error} Send REMOVE <item> to remove it, or STAFF for help.`);
    next = { ...next, cart: verified.items };
    if (!ctx.restaurant.open) {
      return done(next, `${prefix}${summary(next.cart)}\nTakeaway ordering is unavailable right now. Please try again during opening hours, or send STAFF.`);
    }
    if (verified.subtotal < ctx.restaurant.minimumOrder) {
      return done(next, `${prefix}${summary(next.cart)}\nMinimum order is ${money(ctx.restaurant.minimumOrder)}. Add more items to continue.`);
    }
    if (!next.name) {
      return done({ ...next, awaitingName: true }, `${prefix}${summary(next.cart)}\nWhat name should we use for pickup?`);
    }
    next = { ...next, awaitingName: false, token: ctx.newToken(), quotedAt: new Date(ctx.now).toISOString() };
    return done(next, `${prefix}Takeaway order for ${next.name}\n${summary(next.cart)}${next.notes ? `\nNotes: ${next.notes}` : ""}\nPay at collection; no payment has been taken.\nReply YES within 10 minutes to place this order and allow ${ctx.restaurant.name} to use your name and WhatsApp number to process it. No marketing opt-in. To change it, send more items, REMOVE <item> or CLEAR.`);
  };

  const menuReply = () => {
    const page = Math.min(100, Math.max(1, Number(text.match(/\d+$/)?.[0] ?? 1)));
    const list = menu.items.slice((page - 1) * 20, page * 20).map(i => `${i.name} — ${money(Number(i.price))}`).join("\n");
    return `${CHAT_ORDER_HELP}\n\n${list || "No items on this page."}\n${page * 20 < menu.items.length ? `Send MENU ${page + 1} for more.\n` : ""}Full menu: ${ctx.menuLink}`;
  };

  let next: ChatOrderDraft = { ...draft, cart: draft.cart.map(i => ({ ...i })) };
  if (!next.name && profileName && !draft.orderId) next.name = profileName;

  if (HANDOFF.test(text)) {
    return done(clearQuote(next), `${ctx.handoffMessage}\n${draft.orderId ? `Submitted order: ${draft.orderId}` : `Unsent order: ${summary(draft.cart)}`}`, { handoff: true });
  }
  if (text === "new order") {
    const fresh = emptyChatOrder();
    if (profileName) fresh.name = profileName;
    return done(fresh, menuReply());
  }
  const yes = isChatYes(raw);
  const code = chatConfirmCode(raw);
  if (draft.orderId) {
    if (yes || code) return done(draft, `Order ${draft.orderId} was already received; no second order was placed. Send STAFF for changes, or NEW ORDER to start another order.`);
    if (looksLikeChatOrder(raw, menu.items) || ["cart", "checkout", "clear", "cancel"].includes(text)) {
      return done(draft, `Order ${draft.orderId} was already received. Send NEW ORDER to start another order, or STAFF to change this one.`);
    }
    return { handled: false };
  }
  if (text === "clear" || text === "cancel") {
    if (!active) return { handled: false };
    const fresh = emptyChatOrder();
    if (next.name) fresh.name = next.name;
    return done(fresh, "Your order is cleared. No order was placed.");
  }
  if (/^menu(?: \d+)?$/.test(text) || (!active && /^(?:order|takeaway|take away)$/.test(text))) {
    return done(next, menuReply());
  }
  if (text === "cart" || text === "checkout") return quote(next);

  if (yes || code) {
    const check = checkChatConfirmation(draft, { now: ctx.now, sentAtMs: ctx.sentAtMs, code });
    switch (check) {
      case "pending": return settle(next, "Please answer this first — nothing has been ordered yet.\n");
      case "no_quote": return next.cart.length ? quote(next, "Here is your order. Nothing has been placed yet.\n") : (active ? quote(next) : { handled: false });
      case "expired": return quote(next, "That total has expired. Here is an updated one.\n");
      case "wrong_code":
      case "stale": return done(draft, `That confirmation was for an earlier version of your order, so nothing was placed. Your latest order:\n${summary(draft.cart)}\nReply YES to place it.`);
      case "ordered": break; // handled above
      case "ok": {
        const verified = verifyCartAgainstMenu(draft.cart, ctx.pricingMenu, [], menu.catalog);
        const fingerprint = (cart: CartLine[]) => JSON.stringify(cart.map(i => [i.item_id, i.price, i.quantity,
          (i.options ?? []).map(o => o.option_id).sort()]));
        if (!verified.ok || fingerprint(verified.items) !== fingerprint(draft.cart) || !ctx.restaurant.open ||
          verified.subtotal < ctx.restaurant.minimumOrder) {
          return quote(next, verified.ok && fingerprint(verified.items) !== fingerprint(draft.cart)
            ? "Prices or options have changed. Please review again.\n" : "");
        }
        // The draft is passed through unchanged: the database refuses a confirmation whose state differs.
        return done(draft, `WhatsApp takeaway: ${draft.name}\n${summary(draft.cart)}${draft.notes ? `\nNotes: ${draft.notes}` : ""}\nPayment due at collection.`, { confirm: true });
      }
    }
  }

  if (next.pending?.length) {
    const index = next.pending.findIndex(l => {
      const question = pendingQuestion(l, menu);
      return question && !(question.kind === "item" && question.candidates.length < 2);
    });
    if (index >= 0) {
      const answered = answerPendingQuestion(raw, next.pending[index], menu);
      if (!answered) return settle(next, "Sorry, I didn't catch that.\n");
      const pending = [...next.pending];
      pending[index] = answered;
      const noteLines = answered.item_id && answered.note
        ? [...(next.noteLines ?? []), { item_id: answered.item_id, text: answered.note }] : next.noteLines;
      return settle({ ...next, pending, ...(noteLines ? { noteLines } : {}) });
    }
  }

  const orderLike = looksLikeChatOrder(raw, menu.items);
  if (next.awaitingName && !orderLike) {
    const name = sanitizeCustomerName(raw);
    if (!name) return done(clearQuote(next), "Please send the name for pickup.");
    return quote({ ...next, name, awaitingName: false });
  }
  if (!orderLike) return { handled: false };

  const parsed = await ctx.parse(raw);
  if (parsed.kind === "not_order") return { handled: false };
  if (parsed.kind === "error") return done(clearQuote(next), parsed.message);
  if (parsed.kind === "unmatched") {
    return done(clearQuote(next), `I could not find ${parsed.queries.slice(0, 3).map(q => `“${q.slice(0, 60)}”`).join(", ")} on the menu. Send MENU for item names, or STAFF for help. Your order has not changed.\n${ctx.menuLink}`);
  }
  if (parsed.kind === "remove") {
    const ids = new Set(parsed.item_ids);
    return quote(syncNotes({ ...next, cart: next.cart.filter(i => !ids.has(i.item_id)) }));
  }
  const resolved = resolveRequests(parsed.lines, menu);
  if (resolved.error !== undefined) return done(clearQuote(next), resolved.error);
  return settle({ ...next, pending: resolved.pending,
    ...(resolved.noteLines.length ? { noteLines: [...(next.noteLines ?? []), ...resolved.noteLines] } : {}) });
}
