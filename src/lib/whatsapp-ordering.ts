import "server-only";
import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getMenu, getMenuOptionCatalog } from "@/lib/data";
import { verifyCartAgainstMenu } from "@/lib/order-pricing";
import { isRestaurantOpen } from "@/lib/opening-hours";
import { formatCurrency } from "@/lib/currency";
import { getChatConversationByPhone, isChatAutomationActive, recordOutboundChatMessage } from "@/lib/chat-inbox";
import { getWhatsAppChatbotSettings } from "@/lib/whatsapp-ai";
import { sendRestaurantWhatsAppText } from "@/lib/whatsapp-integration";
import { editChatCart, emptyChatOrder, isChatOrderConfirmation, normalizeChatText, type ChatOrderDraft } from "@/lib/whatsapp-order-cart";
import type { Restaurant } from "@/lib/types";

const HELP = 'Takeaway text-ordering pilot. Send item names and quantities (e.g. “2 karak, 1 sandwich”). Send NAME followed by your name, then CHECKOUT. MENU lists items; CART resumes your saved cart; REMOVE followed by an item removes it; CLEAR empties it; STAFF requests a person. Simple items at standard menu prices only; offers and custom options are available through staff or the menu link. Payment is due at collection.';

/** Only called from the authenticated connector webhook; never a public server action. */
export async function handleWhatsAppOrderMessage(input: {
  restaurantId: string; phone: string; messageId: string; text: string; baseUrl: string;
}): Promise<boolean> {
  const settings = await getWhatsAppChatbotSettings(input.restaurantId);
  if (!settings.enabled || !settings.answer_text || !settings.chat_ordering_enabled ||
    !settings.chat_ordering_phones?.includes(input.phone)) return false;
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error("Chat ordering database unavailable");
  const conversation = await getChatConversationByPhone(input.restaurantId, input.phone);
  if (!conversation) throw new Error("Chat ordering conversation unavailable");

  async function deliver(reply: string, sent: boolean) {
    if (sent) return;
    const messageId = await sendRestaurantWhatsAppText(input.restaurantId, input.phone, reply);
    if (!messageId) throw new Error("Chat order reply not sent");
    await recordOutboundChatMessage({ restaurantId: input.restaurantId, conversationId: conversation!.id,
      body: reply, senderType: "system", waMessageId: messageId });
    const { error } = await admin!.from("whatsapp_order_receipts").update({ sent: true })
      .eq("restaurant_id", input.restaurantId).eq("conversation_id", conversation!.id).eq("message_id", input.messageId);
    if (error) throw new Error("Chat order reply receipt unavailable");
  }
  const { data: receipt, error: receiptError } = await admin.from("whatsapp_order_receipts").select("reply,sent")
    .eq("restaurant_id", input.restaurantId).eq("conversation_id", conversation.id).eq("message_id", input.messageId).maybeSingle();
  if (receiptError) throw new Error("Chat order receipt read failed");
  if (receipt) { await deliver(receipt.reply, receipt.sent); return true; }
  if (!isChatAutomationActive(conversation)) return true;

  const [{ data: restaurantData, error: restaurantError }, menu, options] = await Promise.all([
    admin.from("restaurants").select("*").eq("id", input.restaurantId).single(),
    getMenu(input.restaurantId, { admin: true }), getMenuOptionCatalog(input.restaurantId, { admin: true })
  ]);
  if (restaurantError || !restaurantData) throw new Error("Chat ordering restaurant read failed");
  const restaurant = restaurantData as Restaurant;
  const categories = new Set(menu.categories.filter(c => c.is_active).map(c => c.id));
  const publicItems = menu.items.filter(i => !i.staff_only && i.is_available && categories.has(i.category_id));
  const customizedIds = new Set(options.links.map(l => l.menu_item_id));
  const money = (amount: number) => formatCurrency(amount, restaurant);
  const menuLink = `${input.baseUrl.replace(/\/$/, "")}/r/${encodeURIComponent(restaurant.slug)}`;
  const text = normalizeChatText(input.text.slice(0, 2000));
  const handoff = /\b(staff|human|agent|manager|person)\b|موظف|മനുഷ്യൻ/i.test(text);

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error } = await admin.from("whatsapp_order_drafts").select("state,revision,updated_at")
      .eq("restaurant_id", input.restaurantId).eq("conversation_id", conversation.id).maybeSingle();
    if (error) throw new Error("Chat cart read failed");
    const stored = row?.state as ChatOrderDraft | undefined;
    // Keep completed IDs so a repeated confirmation can never start a second order.
    const draft = stored && (stored.orderId || Date.now() - Date.parse(row!.updated_at) < 24 * 60 * 60_000)
      ? stored : emptyChatOrder();
    let next = { ...draft, cart: draft.cart.map(i => ({ ...i })) };
    let reply = "";
    let confirm = false;
    const cartSummary = () => next.cart.length
      ? next.cart.map(i => `${i.quantity} × ${i.name} — ${money(i.quantity * i.price)}`).join("\n") +
        `\nTotal: ${money(next.cart.reduce((sum, i) => sum + i.quantity * i.price, 0))}`
      : "Your cart is empty.";
    if (handoff) {
      next.token = ""; next.quotedAt = null;
      reply = `${settings.handoff_message}\n${draft.orderId ? `Submitted order: ${draft.orderId}` : `Unsent cart: ${cartSummary()}`}`;
    } else if (text === "new order") {
      next = emptyChatOrder(); reply = HELP;
    } else if (draft.orderId) {
      reply = `Order ${draft.orderId} was already received. Send STAFF for changes or NEW ORDER to start another cart.`;
    } else if (/^(menu(?: \d+)?|hi|hello|help|order|takeaway)$/.test(text)) {
      const page = Math.min(100, Math.max(1, Number(text.match(/\d+$/)?.[0] ?? 1)));
      const simple = publicItems.filter(i => !customizedIds.has(i.id));
      reply = `${HELP}\n\n${simple.slice((page - 1) * 20, page * 20).map(i => `${i.name} — ${money(Number(i.price))}`).join("\n") || "No items on this page."}\n${page * 20 < simple.length ? `Send MENU ${page + 1} for more.\n` : ""}Full menu: ${menuLink}`;
    } else if (/^name\s+/.test(text)) {
      next.name = input.text.trim().replace(/^name\s+/i, "").slice(0, 120).trim();
      next.token = ""; next.quotedAt = null;
      reply = `Name saved: ${next.name}.\n${cartSummary()}\nSend CHECKOUT when ready.`;
    } else if (text === "clear" || text === "cancel") {
      next = emptyChatOrder(); reply = "Your unsent cart is cleared. No order was placed.";
    } else if (text === "cart") {
      reply = `${cartSummary()}\n${next.name ? `Name: ${next.name}.` : "Send NAME followed by your name."} Send CHECKOUT to review and confirm.`;
    } else if (text === "checkout" || text.startsWith("confirm")) {
      const verified = verifyCartAgainstMenu(next.cart, { ...menu, items: publicItems }, [], options);
      const open = restaurant.is_active && restaurant.accepting_orders && restaurant.pickup_enabled &&
        ["live", "trial", "paid"].includes(restaurant.status ?? "") &&
        isRestaurantOpen(restaurant.opening_hours_enabled, restaurant.opening_hours, new Date(), restaurant.time_zone);
      if (!open) reply = "Takeaway ordering is currently unavailable. Please try during opening hours or send STAFF.";
      else if (!next.cart.length) reply = "Your cart is empty. Send MENU to start.";
      else if (!next.name) reply = "Send NAME followed by the name for pickup, then CHECKOUT.";
      else if (!verified.ok || next.cart.some(i => customizedIds.has(i.item_id))) {
        reply = `${!verified.ok ? verified.error : "An item now needs custom options."} Remove the affected item or send STAFF.`;
      } else if (verified.subtotal < restaurant.minimum_order_amount) {
        reply = `Minimum order is ${money(restaurant.minimum_order_amount)}. Add more items before checkout.`;
      } else {
        const samePrice = JSON.stringify(verified.items.map(i => [i.item_id, i.price, i.quantity])) ===
          JSON.stringify(next.cart.map(i => [i.item_id, i.price, i.quantity]));
        if (samePrice && isChatOrderConfirmation(text, draft)) {
          confirm = true; reply = `WhatsApp takeaway: ${next.name}\n${cartSummary()}\nPayment due at collection.`;
        } else {
          next.cart = verified.items;
          next.token = randomBytes(6).toString("hex");
          next.quotedAt = new Date().toISOString();
          reply = `${!samePrice ? "Prices have changed. Please review again.\n" : ""}Takeaway for ${next.name}\n${cartSummary()}\nPay at collection; no payment has been taken.\nReply CONFIRM ${next.token} within 10 minutes to place this order and allow ${restaurant.name} to use your name and WhatsApp number to process it. No marketing opt-in. Editing the cart requires a new confirmation.`;
        }
      }
      if (!confirm && !reply.includes(`CONFIRM ${next.token}`)) { next.token = ""; next.quotedAt = null; }
    } else {
      const edited = editChatCart(input.text, next.cart, publicItems, customizedIds);
      if (edited.error) reply = `${edited.error}\n${menuLink}`;
      else { next.cart = edited.cart!; reply = `${cartSummary()}\n${next.name ? "Send CHECKOUT when ready." : "Send NAME followed by your pickup name, then CHECKOUT."}`; }
      next.token = ""; next.quotedAt = null;
    }
    const { data: applied, error: applyError } = await admin.rpc("apply_whatsapp_order_command", {
      target_restaurant_id: input.restaurantId, target_conversation_id: conversation.id,
      target_message_id: input.messageId, expected_revision: row?.revision ?? 0,
      next_state: next, response_text: reply, confirm_order: confirm, handoff
    });
    if (applyError) throw new Error(`Chat order save failed: ${applyError.code}`);
    if (applied.conflict) continue;
    if (applied.paused) return true;
    if (applied.refresh) {
      // A catalog edit raced checkout. Do not retry creation with an unseen price.
      throw new Error("Chat quote changed; customer must request CHECKOUT again");
    }
    await deliver(applied.reply, applied.sent);
    return true;
  }
  throw new Error("Concurrent cart edit; retry message");
}
