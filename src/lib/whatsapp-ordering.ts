import "server-only";
import { randomBytes } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getMenu, getMenuOptionCatalog } from "@/lib/data";
import { isRestaurantOpen } from "@/lib/opening-hours";
import { formatCurrency } from "@/lib/currency";
import { getChatConversationByPhone, isChatAutomationActive, recordOutboundChatMessage } from "@/lib/chat-inbox";
import { getWhatsAppChatbotSettings, isChatOrderingAllowed } from "@/lib/whatsapp-ai";
import { sendRestaurantWhatsAppText } from "@/lib/whatsapp-integration";
import { chatSentAtMs, emptyChatOrder, type ChatMenu, type ChatOrderDraft } from "@/lib/whatsapp-order-cart";
import { deterministicChatParse, runChatOrderTurn, type ChatOrderParser } from "@/lib/whatsapp-order-flow";
import type { Restaurant } from "@/lib/types";

const DRAFT_TTL_MS = 24 * 60 * 60_000;

/**
 * Only called from the authenticated connector webhook; never a public server action.
 * Returns false when chat ordering does not apply to this message, so the
 * receptionist answers it instead. Nothing is stored in that case.
 */
export async function handleWhatsAppOrderMessage(input: {
  restaurantId: string; phone: string; messageId: string; text: string; baseUrl: string;
  /** Connector timestamp (unix seconds) of the inbound message. */
  sentAt?: string;
}): Promise<boolean> {
  const settings = await getWhatsAppChatbotSettings(input.restaurantId);
  if (!isChatOrderingAllowed(settings, input.phone)) return false;
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

  const [{ data: restaurantData, error: restaurantError }, fullMenu, catalog] = await Promise.all([
    admin.from("restaurants").select("*").eq("id", input.restaurantId).single(),
    getMenu(input.restaurantId, { admin: true }), getMenuOptionCatalog(input.restaurantId, { admin: true })
  ]);
  if (restaurantError || !restaurantData) throw new Error("Chat ordering restaurant read failed");
  const restaurant = restaurantData as Restaurant;
  const categories = new Set(fullMenu.categories.filter(c => c.is_active).map(c => c.id));
  const items = fullMenu.items.filter(i => !i.staff_only && i.is_available && categories.has(i.category_id));
  const menu: ChatMenu = { items, catalog };
  const now = Date.now();
  const open = Boolean(restaurant.is_active && restaurant.accepting_orders && restaurant.pickup_enabled &&
    ["live", "trial", "paid"].includes(restaurant.status ?? "") &&
    isRestaurantOpen(restaurant.opening_hours_enabled, restaurant.opening_hours, new Date(now), restaurant.time_zone));
  // A revision conflict re-runs the turn; never parse the same text twice.
  let parsed: ReturnType<ChatOrderParser> | null = null;
  const parse: ChatOrderParser = text => (parsed ??= Promise.resolve(deterministicChatParse(text, menu)));

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: row, error } = await admin.from("whatsapp_order_drafts").select("state,revision,updated_at")
      .eq("restaurant_id", input.restaurantId).eq("conversation_id", conversation.id).maybeSingle();
    if (error) throw new Error("Chat cart read failed");
    const stored = row?.state as ChatOrderDraft | undefined;
    // Keep completed IDs so a repeated confirmation can never start a second order.
    const draft = stored && (stored.orderId || now - Date.parse(row!.updated_at) < DRAFT_TTL_MS)
      ? stored : emptyChatOrder();
    const turn = await runChatOrderTurn({
      text: input.text, draft, now, sentAtMs: chatSentAtMs(input.sentAt, now),
      profileName: conversation.customer_name, menu,
      pricingMenu: { ...fullMenu, items },
      restaurant: { name: restaurant.name, open, minimumOrder: Number(restaurant.minimum_order_amount ?? 0) },
      money: amount => formatCurrency(amount, restaurant),
      menuLink: `${input.baseUrl.replace(/\/$/, "")}/r/${encodeURIComponent(restaurant.slug)}`,
      handoffMessage: settings.handoff_message,
      newToken: () => randomBytes(6).toString("hex"),
      parse
    });
    if (!turn.handled) return false;
    const { data: applied, error: applyError } = await admin.rpc("apply_whatsapp_order_command", {
      target_restaurant_id: input.restaurantId, target_conversation_id: conversation.id,
      target_message_id: input.messageId, expected_revision: row?.revision ?? 0,
      next_state: turn.next, response_text: turn.reply, confirm_order: turn.confirm, handoff: turn.handoff
    });
    if (applyError) throw new Error(`Chat order save failed: ${applyError.code}`);
    if (applied.conflict) continue;
    if (applied.paused) return true;
    await deliver(applied.reply, applied.sent);
    return true;
  }
  throw new Error("Concurrent cart edit; retry message");
}
