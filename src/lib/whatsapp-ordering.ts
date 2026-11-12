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
import { deterministicChatParse, runChatOrderTurn, type ChatOrderParser, type ChatParseResult } from "@/lib/whatsapp-order-flow";
import { buildParserCatalog, callGeminiChatParser, validateParserOutput, type ValidatedParse } from "@/lib/whatsapp-order-parser";
import type { Restaurant } from "@/lib/types";

const DRAFT_TTL_MS = 24 * 60 * 60_000;
/** Gemini parses per conversation per hour; beyond it only exact menu names are understood. */
export const GEMINI_PARSES_PER_HOUR = 20;

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type ParseLog = { parser: "deterministic" | "gemini"; parsed: unknown; outcome: ValidatedParse["outcome"]; reason?: string; model?: string };

/**
 * Deterministic matching first; Gemini only when that cannot place every item.
 * Every parse is logged for review. Logging failures never block ordering.
 */
function createChatOrderParser(admin: Admin, scope: { restaurantId: string; conversationId: string; messageId: string }, menu: ChatMenu): ChatOrderParser {
  const log = async (text: string, entry: ParseLog) => {
    const { error } = await admin.from("whatsapp_order_parse_logs").upsert({
      restaurant_id: scope.restaurantId, conversation_id: scope.conversationId, message_id: scope.messageId,
      parser: entry.parser, model: entry.model ?? null, input_text: text.slice(0, 2000), parsed: entry.parsed,
      outcome: entry.outcome, reason: entry.reason?.slice(0, 500) ?? null
    }, { onConflict: "restaurant_id,message_id,parser", ignoreDuplicates: true });
    if (error) console.error("WhatsOrder chat parse log failed", error.code);
  };
  const capReached = async () => {
    const { count, error } = await admin.from("whatsapp_order_parse_logs").select("id", { count: "exact", head: true })
      .eq("restaurant_id", scope.restaurantId).eq("conversation_id", scope.conversationId).eq("parser", "gemini")
      .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString());
    return Boolean(error) || (count ?? 0) >= GEMINI_PARSES_PER_HOUR;
  };

  return async text => {
    const fast = deterministicChatParse(text, menu);
    if (fast.kind !== "unmatched") {
      await log(text, { parser: "deterministic", parsed: fast, outcome: fast.kind === "error" ? "rejected"
        : fast.kind === "add" && fast.lines.some(l => !l.item_id) ? "clarify" : "accepted" });
      return fast;
    }
    const apiKey = process.env.GEMINI_API_KEY;
    const skip = !apiKey ? "gemini not configured" : await capReached() ? "gemini hourly limit reached" : null;
    await log(text, { parser: "deterministic", parsed: fast, outcome: "rejected", reason: skip ?? "unmatched; trying gemini" });
    if (skip || !apiKey) return fast;

    // A connector retry of this message reuses the earlier model result instead of calling Gemini again.
    const { data: previous } = await admin.from("whatsapp_order_parse_logs").select("parsed,outcome")
      .eq("restaurant_id", scope.restaurantId).eq("message_id", scope.messageId).eq("parser", "gemini").maybeSingle();
    const reused = (previous?.parsed as { result?: ChatParseResult } | null)?.result;
    if (previous && previous.outcome !== "error" && reused) return reused;

    const model = process.env.WHATSAPP_ORDER_AI_MODEL ?? process.env.WHATSAPP_AI_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
    const { catalog, aliases } = buildParserCatalog(menu);
    const call = await callGeminiChatParser(text, catalog, { apiKey, model });
    const validated: ValidatedParse = call.raw === null
      ? { result: fast, outcome: "error", reason: call.error ?? "no output" }
      : validateParserOutput(call.raw, text, aliases);
    const rawJson = JSON.stringify(call.raw ?? null);
    await log(text, { parser: "gemini", model, outcome: validated.outcome, reason: validated.reason,
      parsed: { raw: rawJson.length <= 20_000 ? call.raw : { truncated: true }, result: validated.result } });
    // Malformed or failed model output never guesses: fall back to the deterministic answer.
    return validated.outcome === "error" ? fast : validated.result;
  };
}

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
  // A revision conflict re-runs the turn; never parse (or log) the same text twice.
  const parser = createChatOrderParser(admin, { restaurantId: input.restaurantId, conversationId: conversation.id,
    messageId: input.messageId }, menu);
  let parsed: ReturnType<ChatOrderParser> | null = null;
  const parse: ChatOrderParser = text => (parsed ??= parser(text));

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
