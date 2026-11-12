// One WhatsApp chat-ordering turn as a pure function: message + stored draft
// in, reply + next draft out. The caller (whatsapp-ordering.ts) owns I/O, the
// revision-checked save and order creation (apply_whatsapp_order_command).
import { formatOrderItemName } from "@/lib/cart-line";
import { verifyCartAgainstMenu } from "@/lib/order-pricing";
import type { CartLine, MenuWithCategories } from "@/lib/types";
import {
  answerPendingQuestion,
  applyOptionDefaults,
  chatCommand,
  chatConfirmCode,
  checkChatConfirmation,
  describeQuestion,
  emptyChatOrder,
  isChatYes,
  localName,
  looksLikeChatOrder,
  mergeIntoCart,
  normalizeChatText,
  parseChatOrderText,
  pendingQuestion,
  sanitizeChatNote,
  sanitizeCustomerName,
  syncNotes,
  validateOptionPicks,
  withinCartLimits,
  MAX_LINES,
  MAX_QUANTITY,
  type ChatMenu,
  type ChatOrderDraft,
  type PendingChatLine
} from "@/lib/whatsapp-order-cart";
import {
  CHAT_COPY,
  resolveChatLang,
  type ChatError,
  type ChatLang,
  type ChatLanguageMode
} from "@/lib/whatsapp-order-i18n";

/** One requested line from a parser. Untrusted until resolveRequests checks it against the menu. */
export type ChatItemRequest = {
  item_id: string | null;
  candidates: string[];
  query: string;
  quantity: number;
  option_ids: string[];
  note: string;
};

/** Set an item's quantity (0 removes it). Untrusted until checked against the menu and cart. */
export type ChatSetRequest = { item_id: string; query: string; quantity: number };

export type ChatParseResult =
  | { kind: "add"; lines: ChatItemRequest[] }
  | { kind: "remove"; item_ids: string[] }
  | { kind: "set"; lines: ChatSetRequest[] }
  | { kind: "unmatched"; queries: string[] }
  /** Not an order after all (e.g. a question): the receptionist answers it. */
  | { kind: "not_order" }
  | { kind: "error"; error: ChatError };

export type ChatOrderParser = (text: string) => Promise<ChatParseResult>;

/** The deterministic fast path: exact or word-prefix matches only. */
export function deterministicChatParse(text: string, menu: ChatMenu): ChatParseResult {
  const parsed = parseChatOrderText(text, menu.items);
  if ("error" in parsed) return { kind: "error", error: parsed.error };
  const unmatched = parsed.segments.filter(s => !s.matches.length).map(s => s.query);
  if (unmatched.length) return { kind: "unmatched", queries: unmatched };
  if (parsed.op === "remove" || parsed.op === "set") {
    const ambiguous = parsed.segments.find(s => s.matches.length > 1);
    if (ambiguous) return { kind: "error", error: { code: "remove_ambiguous", names: ambiguous.matches.slice(0, 6).map(i => i.name) } };
    return parsed.op === "remove"
      ? { kind: "remove", item_ids: parsed.segments.map(s => s.matches[0].id) }
      : { kind: "set", lines: parsed.segments.map(s => ({ item_id: s.matches[0].id, query: s.query, quantity: s.quantity })) };
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
  /** The chatbot's language setting; "customer" follows the customer's script. */
  languageMode?: ChatLanguageMode;
  newToken: () => string;
  parse: ChatOrderParser;
};

export type ChatTurn =
  | { handled: false }
  | { handled: true; next: ChatOrderDraft; reply: string; confirm: boolean; handoff: boolean };

export const CHAT_ORDER_HELP = CHAT_COPY.en.help;
const HANDOFF = /\b(staff|human|agent|manager|person)\b|موظف|شخص|مدير|മനുഷ്യൻ/i;
const MAX_REPLY = 4000;

const clearQuote = (draft: ChatOrderDraft): ChatOrderDraft => ({ ...draft, token: "", quotedAt: null });

/** Validates parser output against the live menu. Returns pending lines, or an error for the customer. */
export function resolveRequests(lines: ChatItemRequest[], menu: ChatMenu):
  { pending: PendingChatLine[]; noteLines: { item_id: string; text: string }[]; error?: never } | { error: ChatError } {
  if (!lines.length || lines.length > MAX_LINES) return { error: { code: "shape" } };
  const ids = new Set(menu.items.map(i => i.id));
  const pending: PendingChatLine[] = [];
  const noteLines: { item_id: string; text: string }[] = [];
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > MAX_QUANTITY) {
      return { error: { code: "quantity_range" } };
    }
    const itemId = line.item_id && ids.has(line.item_id) ? line.item_id : null;
    const candidates = [...new Set(line.candidates.filter(id => ids.has(id)))].slice(0, 6);
    if (!itemId && candidates.length < 2) {
      if (candidates.length === 1) {
        pending.push(applyOptionDefaults({ item_id: candidates[0], candidates: [], quantity: line.quantity, picks: [] }, menu.catalog));
        continue;
      }
      return { error: { code: "not_found", query: line.query.slice(0, 60) } };
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
  const lang: ChatLang = resolveChatLang(ctx.languageMode, raw, draft.lang);
  const copy = CHAT_COPY[lang];
  const profileName = sanitizeCustomerName(ctx.profileName);
  const active = Boolean(draft.cart.length || draft.pending?.length || draft.awaitingName || draft.token);
  const command = chatCommand(raw);

  const summary = (cart: CartLine[]) => cart.length
    ? cart.map(i => `${i.quantity} × ${formatOrderItemName(i, lang)} — ${money(i.quantity * i.price)}`).join("\n") +
      `\n${copy.total(money(cart.reduce((sum, i) => sum + i.quantity * i.price, 0)))}`
    : copy.emptyOrder;
  const done = (next: ChatOrderDraft, reply: string, extra: { confirm?: boolean; handoff?: boolean } = {}): ChatTurn => {
    if (reply.length > MAX_REPLY) {
      // The linked-device transport caps texts at 4096 characters. Never truncate a total or the consent text.
      return { handled: true, next: clearQuote(next), confirm: false, handoff: extra.handoff ?? false, reply: copy.tooLong(ctx.menuLink) };
    }
    return { handled: true, next, reply, confirm: extra.confirm ?? false, handoff: extra.handoff ?? false };
  };
  const fail = (next: ChatOrderDraft, error: ChatError) => done(clearQuote(next), copy.error(error));
  const line = (prefix: string) => (prefix ? `${prefix}\n` : "");
  const ask = (next: ChatOrderDraft, prefix = ""): ChatTurn | null => {
    for (const pendingLine of next.pending ?? []) {
      const question = pendingQuestion(pendingLine, menu);
      if (question?.kind === "item" && question.candidates.length < 2) continue;
      if (question) return done(clearQuote(next), `${line(prefix)}${describeQuestion(question, money, lang)}`);
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
      if (!merged.cart) return fail({ ...next, pending: [] }, merged.error);
      next = syncNotes({ ...next, cart: merged.cart, pending: [] });
    }
    return quote(next, prefix);
  };

  /** Issues a fresh confirmable quote when everything is in place. */
  const quote = (next: ChatOrderDraft, prefix = ""): ChatTurn => {
    next = clearQuote(next);
    if (next.pending?.length) return settle(next, prefix);
    if (!next.cart.length) return done(next, `${line(prefix)}${copy.emptyOrder} ${copy.help}`);
    const verified = verifyCartAgainstMenu(next.cart, ctx.pricingMenu, [], menu.catalog);
    if (!verified.ok) return done(next, `${line(prefix)}${copy.priceProblem(verified.error)}`);
    next = { ...next, cart: verified.items };
    if (!ctx.restaurant.open) return done(next, `${line(prefix)}${summary(next.cart)}\n${copy.unavailable}`);
    if (verified.subtotal < ctx.restaurant.minimumOrder) {
      return done(next, `${line(prefix)}${summary(next.cart)}\n${copy.minimum(money(ctx.restaurant.minimumOrder))}`);
    }
    if (!next.name) return done({ ...next, awaitingName: true }, `${line(prefix)}${summary(next.cart)}\n${copy.askName}`);
    next = { ...next, awaitingName: false, token: ctx.newToken(), quotedAt: new Date(ctx.now).toISOString() };
    return done(next, `${line(prefix)}${copy.quoteHeader(next.name)}\n${summary(next.cart)}${next.notes ? `\n${copy.notes(next.notes)}` : ""}\n${copy.quoteFooter(ctx.restaurant.name)}`);
  };

  const menuReply = (page = 1) => {
    const list = menu.items.slice((page - 1) * 20, page * 20).map(i => `${localName(i, lang)} — ${money(Number(i.price))}`).join("\n");
    return `${copy.help}\n\n${list || copy.noItemsOnPage}\n${page * 20 < menu.items.length ? `${copy.moreMenu(page + 1)}\n` : ""}${copy.fullMenu(ctx.menuLink)}`;
  };

  let next: ChatOrderDraft = { ...draft, cart: draft.cart.map(i => ({ ...i })), lang };
  if (!next.name && profileName && !draft.orderId) next.name = profileName;

  if (HANDOFF.test(text)) {
    return done(clearQuote(next), `${ctx.handoffMessage}\n${draft.orderId ? copy.handoffOrder(draft.orderId) : copy.handoffCart(summary(draft.cart))}`, { handoff: true });
  }
  if (command?.kind === "new_order") {
    const fresh: ChatOrderDraft = { ...emptyChatOrder(), lang };
    if (profileName) fresh.name = profileName;
    return done(fresh, menuReply());
  }
  const yes = isChatYes(raw);
  const code = chatConfirmCode(raw);
  if (draft.orderId) {
    if (yes || code) return done(draft, copy.alreadyReceivedYes(draft.orderId));
    if (looksLikeChatOrder(raw, menu.items) || command?.kind === "cart" || command?.kind === "clear") {
      return done(draft, copy.alreadyReceived(draft.orderId));
    }
    return { handled: false };
  }
  if (command?.kind === "clear") {
    if (!active) return { handled: false };
    const fresh: ChatOrderDraft = { ...emptyChatOrder(), lang };
    if (next.name) fresh.name = next.name;
    return done(fresh, copy.cleared);
  }
  if (command?.kind === "menu") return done(next, menuReply(command.page));
  if (command?.kind === "order" && !active) return done(next, menuReply());
  if (command?.kind === "cart") return quote(next);

  if (yes || code) {
    const check = checkChatConfirmation(draft, { now: ctx.now, sentAtMs: ctx.sentAtMs, code });
    switch (check) {
      case "pending": return settle(next, copy.answerFirst);
      case "no_quote": return next.cart.length ? quote(next, copy.nothingPlacedYet) : (active ? quote(next) : { handled: false });
      case "expired": return quote(next, copy.expired);
      case "wrong_code":
      case "stale": return done(draft, copy.stale(summary(draft.cart)));
      case "ordered": break; // handled above
      case "ok": {
        const verified = verifyCartAgainstMenu(draft.cart, ctx.pricingMenu, [], menu.catalog);
        const fingerprint = (cart: CartLine[]) => JSON.stringify(cart.map(i => [i.item_id, i.price, i.quantity,
          (i.options ?? []).map(o => o.option_id).sort()]));
        if (!verified.ok || fingerprint(verified.items) !== fingerprint(draft.cart) || !ctx.restaurant.open ||
          verified.subtotal < ctx.restaurant.minimumOrder) {
          return quote(next, verified.ok && fingerprint(verified.items) !== fingerprint(draft.cart) ? copy.pricesChanged : "");
        }
        // The draft is passed through unchanged: the database refuses a confirmation whose state differs.
        return done(draft, copy.confirmed(draft.name, summary(draft.cart), draft.notes ?? ""), { confirm: true });
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
      if (!answered) return settle(next, copy.didNotCatch);
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
    if (!name) return done(clearQuote(next), copy.sendName);
    return quote({ ...next, name, awaitingName: false });
  }
  if (!orderLike) return { handled: false };

  const parsed = await ctx.parse(raw);
  if (parsed.kind === "not_order") return { handled: false };
  if (parsed.kind === "error") return fail(next, parsed.error);
  if (parsed.kind === "unmatched") {
    const quoteMarks = lang === "ar" ? ["«", "»"] : ["“", "”"];
    const what = parsed.queries.length
      ? parsed.queries.slice(0, 3).map(q => `${quoteMarks[0]}${q.slice(0, 60)}${quoteMarks[1]}`).join(lang === "ar" ? "، " : ", ")
      : copy.someItems;
    return done(clearQuote(next), copy.notFound(what, ctx.menuLink));
  }
  if (parsed.kind === "remove") {
    const ids = new Set(parsed.item_ids);
    return quote(syncNotes({ ...next, cart: next.cart.filter(i => !ids.has(i.item_id)) }));
  }
  if (parsed.kind === "set") {
    let cart = next.cart.map(i => ({ ...i }));
    const additions: ChatItemRequest[] = [];
    for (const request of parsed.lines) {
      const item = menu.items.find(i => i.id === request.item_id);
      if (!item) return fail(next, { code: "not_found", query: request.query.slice(0, 60) });
      if (!Number.isInteger(request.quantity) || request.quantity < 0 || request.quantity > MAX_QUANTITY) {
        return fail(next, { code: "quantity_range" });
      }
      const existing = cart.filter(i => i.item_id === item.id);
      // Several configurations (Small and Large) cannot be set by one number without guessing.
      if (existing.length > 1) return fail(next, { code: "set_ambiguous", name: localName(item, lang) });
      if (existing.length === 1) {
        cart = request.quantity === 0 ? cart.filter(i => i !== existing[0]) : cart.map(i => (i === existing[0] ? { ...i, quantity: request.quantity } : i));
      } else if (request.quantity === 0) {
        return done(clearQuote(next), copy.notInOrder(localName(item, lang)));
      } else {
        additions.push({ item_id: item.id, candidates: [], query: request.query, quantity: request.quantity, option_ids: [], note: "" });
      }
    }
    if (!withinCartLimits(cart)) return fail(next, { code: "cart_limit" });
    next = syncNotes({ ...next, cart });
    if (!additions.length) return quote(next);
    const resolvedAdds = resolveRequests(additions, menu);
    if (resolvedAdds.error !== undefined) return fail(next, resolvedAdds.error);
    return settle({ ...next, pending: resolvedAdds.pending });
  }
  const resolved = resolveRequests(parsed.lines, menu);
  if (resolved.error !== undefined) return fail(next, resolved.error);
  return settle({ ...next, pending: resolved.pending,
    ...(resolved.noteLines.length ? { noteLines: [...(next.noteLines ?? []), ...resolved.noteLines] } : {}) });
}
