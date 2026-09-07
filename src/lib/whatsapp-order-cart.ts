import type { CartLine, MenuItem } from "@/lib/types";

export type ChatOrderDraft = {
  cart: CartLine[];
  name: string;
  token: string;
  quotedAt: string | null;
  orderId: string | null;
};
export const emptyChatOrder = (): ChatOrderDraft => ({ cart: [], name: "", token: "", quotedAt: null, orderId: null });
export function normalizeChatText(text: string) {
  return text.toLowerCase().normalize("NFKC").replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
}
export function matchChatItem(text: string, items: MenuItem[]) {
  const query = normalizeChatText(text);
  if (!query) return [];
  const exact = items.filter(i => [i.name, i.name_ar].some(n => n && normalizeChatText(n) === query));
  return exact.length ? exact : items.filter(i => [i.name, i.name_ar].some(n => n && normalizeChatText(n).includes(query)));
}

// Conservative matching: every segment must resolve, or the entire edit is rejected.
// No model-generated identifiers, prices, quantities or confirmation decisions.
export function editChatCart(text: string, cart: CartLine[], items: MenuItem[], customizedIds: Set<string>):
  { cart: CartLine[]; error?: never } | { error: string; cart?: never } {
  const normalized = normalizeChatText(text.replace(/\n/g, ",")).replace(/^(?:i would like|i want|can i have|please add|add|order)\s+/, "");
  const remove = normalized.startsWith("remove ");
  const segments = normalized.replace(/^remove\s+/, "").split(/\s+and\s+|[,\n]/).map(s => s.trim()).filter(Boolean);
  if (!segments.length || segments.length > 20) return { error: "Send an item name and quantity, for example: 2 karak, 1 sandwich." };
  const next = cart.map(i => ({ ...i }));
  for (const segment of segments) {
    const match = segment.match(/^(?:(\d+)\s+(?:x\s+)?)?(.+)$/);
    if (!match) return { error: "Please send an item name and a whole-number quantity." };
    const quantity = Number(match[1] ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 25) return { error: "Choose a quantity from 1 to 25 per item." };
    const found = matchChatItem(match[2], items);
    if (!found.length) return { error: `I could not match “${match[2]}”. Send MENU for exact names, or STAFF for help. Your cart has not changed.` };
    if (found.length !== 1) return { error: `Which item did you mean? ${found.slice(0, 6).map(i => i.name).join(", ")}. Send the full item name and quantity. Your cart has not changed.` };
    const item = found[0];
    if (!remove && customizedIds.has(item.id)) return { error: `${item.name} has custom options. Send STAFF for help with this item, or use the menu link. Your cart has not changed.` };
    const index = next.findIndex(i => i.item_id === item.id);
    if (remove) {
      if (index >= 0) next.splice(index, 1);
    } else if (index >= 0) next[index].quantity += quantity;
    else next.push({ item_id: item.id, name: item.name, price: Number(item.price), quantity });
  }
  if (next.length > 20 || next.some(i => i.quantity > 25) || next.reduce((sum, i) => sum + i.quantity, 0) > 100) {
    return { error: "This pilot supports up to 20 different items, 25 of each, and 100 items total. Your cart has not changed." };
  }
  return { cart: next };
}

export function isChatOrderConfirmation(text: string, draft: ChatOrderDraft, now = Date.now()) {
  return Boolean(draft.token && draft.quotedAt && draft.cart.length && draft.name && !draft.orderId &&
    now - Date.parse(draft.quotedAt) >= 0 && now - Date.parse(draft.quotedAt) <= 10 * 60_000 &&
    normalizeChatText(text) === `confirm ${draft.token.toLowerCase()}`);
}
