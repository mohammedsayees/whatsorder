import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  state: null as null | { state: Record<string, unknown>; revision: number; updated_at: string },
  receipts: new Map<string, { reply: string; sent: boolean }>(),
  sent: [] as string[], failSend: false, allowed: true, paused: false, creates: 0, price: 2,
  confirms: [] as Record<string, unknown>[]
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/whatsapp-ai", () => ({ getWhatsAppChatbotSettings: async () => ({
  enabled: true, answer_text: true, chat_ordering_enabled: mock.allowed,
  chat_ordering_phones: ["971500000077"], handoff_message: "Staff will help"
}) }));
vi.mock("@/lib/chat-inbox", () => ({
  getChatConversationByPhone: async () => ({ id: "conversation", automation_state: mock.paused ? "paused" : "active" }),
  isChatAutomationActive: (c: { automation_state: string }) => c.automation_state === "active",
  recordOutboundChatMessage: async () => undefined
}));
vi.mock("@/lib/whatsapp-integration", () => ({ sendRestaurantWhatsAppText: async (_r: string, _p: string, reply: string) => {
  if (mock.failSend) return null;
  mock.sent.push(reply); return "outbound-id";
} }));
vi.mock("@/lib/data", () => ({
  getMenu: async () => ({ categories: [{ id: "category", is_active: true }], items: [
    { id: "tea", category_id: "category", name: "Karak", price: mock.price, is_available: true }
  ] }),
  getMenuOptionCatalog: async () => ({ links: [], groups: [], options: [] })
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({
  from(table: string) {
    const filters: Record<string, string> = {};
    let update: Record<string, unknown> | undefined;
    const result = () => {
      if (table === "restaurants") return { data: { name: "Cafe", slug: "cafe", is_active: true,
        accepting_orders: true, pickup_enabled: true, status: "live", opening_hours_enabled: false,
        minimum_order_amount: 0, currency_code: "AED" }, error: null };
      if (table === "whatsapp_order_drafts") return { data: mock.state, error: null };
      const receipt = mock.receipts.get(filters.message_id);
      if (update && receipt) Object.assign(receipt, update);
      return { data: receipt ?? null, error: null };
    };
    const query = { select: () => query, update: (value: Record<string, unknown>) => { update = value; return query; },
      eq: (key: string, value: string) => { filters[key] = value; return query; },
      maybeSingle: async () => result(), single: async () => result(),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve)
    };
    return query;
  },
  async rpc(_name: string, args: Record<string, unknown>) {
    const id = args.target_message_id as string;
    const existing = mock.receipts.get(id);
    if (existing) return { data: existing, error: null };
    if (args.expected_revision !== (mock.state?.revision ?? 0)) return { data: { conflict: true }, error: null };
    const state = structuredClone(args.next_state as Record<string, unknown>);
    let reply = String(args.response_text);
    if (args.confirm_order) {
      mock.confirms.push(args); mock.creates++;
      state.orderId = "saved-order"; reply = "Order saved-order received for takeaway. Payment is due at collection.";
    }
    if (args.handoff) mock.paused = true;
    mock.state = { state, revision: (mock.state?.revision ?? 0) + 1, updated_at: new Date().toISOString() };
    const receipt = { reply, sent: false }; mock.receipts.set(id, receipt);
    return { data: receipt, error: null };
  }
}) }));
import { handleWhatsAppOrderMessage } from "./whatsapp-ordering";
const send = (messageId: string, text: string, phone = "971500000077") => handleWhatsAppOrderMessage({
  restaurantId: "restaurant", phone, messageId, text, baseUrl: "https://example.com"
});
beforeEach(() => {
  mock.state = null; mock.receipts.clear(); mock.sent = []; mock.failSend = false;
  mock.allowed = true; mock.paused = false; mock.creates = 0; mock.confirms = []; mock.price = 2;
});
describe("takeaway webhook conversation", () => {
  it("requires a named, reviewed cart then creates one order across repeated confirms", async () => {
    await send("1", "2 karak");
    await send("2", "checkout");
    expect(mock.sent.at(-1)).toContain("NAME"); expect(mock.creates).toBe(0);
    await send("3", "NAME Test customer"); await send("4", "checkout");
    const token = mock.state!.state.token;
    expect(mock.sent.at(-1)).toContain(`CONFIRM ${token}`);
    await send("5", `confirm ${token}`); await send("5", `confirm ${token}`); await send("6", `confirm ${token}`);
    expect(mock.creates).toBe(1);
    expect(mock.sent.at(-1)).toContain("saved-order");
  });
  it("recovers an unsent reply without applying the item twice", async () => {
    mock.failSend = true;
    await expect(send("1", "2 karak")).rejects.toThrow("not sent");
    mock.failSend = false; await send("1", "2 karak");
    expect(mock.state!.state.cart).toEqual([expect.objectContaining({ quantity: 2 })]);
    expect(mock.sent).toHaveLength(1);
  });
  it("retains an order after an acknowledgement failure", async () => {
    await send("1", "1 karak"); await send("2", "name Test"); await send("3", "checkout");
    const token = mock.state!.state.token;
    mock.failSend = true; await expect(send("4", `confirm ${token}`)).rejects.toThrow();
    mock.failSend = false; await send("4", `confirm ${token}`);
    expect(mock.creates).toBe(1); expect(mock.sent.at(-1)).toContain("saved-order");
  });
  it("requires a new confirmation when a price or cart changes", async () => {
    await send("1", "1 karak"); await send("2", "name Test"); await send("3", "checkout");
    const token = mock.state!.state.token;
    mock.price = 3; await send("4", `confirm ${token}`);
    expect(mock.creates).toBe(0); expect(mock.sent.at(-1)).toContain("Prices have changed");
    expect(mock.state!.state.token).not.toBe(token);
    const replacement = mock.state!.state.token;
    await send("5", "1 karak"); await send("6", `confirm ${replacement}`);
    expect(mock.creates).toBe(0);
  });
  it("keeps excluded customers on the existing flow and honors staff takeover", async () => {
    expect(await send("1", "1 karak", "971500000099")).toBe(false);
    expect(mock.state).toBeNull();
    await send("2", "1 karak"); await send("3", "staff");
    expect(mock.paused).toBe(true); expect(mock.sent.at(-1)).toContain("Unsent cart");
    await send("4", "checkout"); expect(mock.creates).toBe(0);
  });
});
