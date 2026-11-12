import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  state: null as null | { state: Record<string, unknown>; revision: number; updated_at: string },
  receipts: new Map<string, { reply: string; sent: boolean }>(),
  sent: [] as string[], failSend: false, mode: "approved" as "off" | "approved" | "everyone", paused: false,
  creates: 0, price: 2, conflictsBeforeSave: 0, profileName: "Ali" as string | null, rpcCalls: 0
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/whatsapp-ai", async (importOriginal) => ({
  isChatOrderingAllowed: (await importOriginal<typeof import("@/lib/whatsapp-ai")>()).isChatOrderingAllowed,
  getWhatsAppChatbotSettings: async () => ({
    enabled: true, answer_text: true, chat_ordering_mode: mock.mode,
    chat_ordering_phones: ["971500000077"], handoff_message: "Staff will help"
  })
}));
vi.mock("@/lib/chat-inbox", () => ({
  getChatConversationByPhone: async () => ({ id: "conversation", customer_name: mock.profileName,
    automation_state: mock.paused ? "paused" : "active" }),
  isChatAutomationActive: (c: { automation_state: string }) => c.automation_state === "active",
  recordOutboundChatMessage: async () => undefined
}));
vi.mock("@/lib/whatsapp-integration", () => ({ sendRestaurantWhatsAppText: async (_r: string, _p: string, reply: string) => {
  if (mock.failSend) return null;
  mock.sent.push(reply); return "outbound-id";
} }));
vi.mock("@/lib/data", () => ({
  getMenu: async () => ({ categories: [{ id: "category", is_active: true }], items: [
    { id: "tea", category_id: "category", name: "Karak", price: mock.price, is_available: true },
    { id: "secret", category_id: "category", name: "Family platter", price: 0, is_available: true, staff_only: true }
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
  // Mirrors apply_whatsapp_order_command: receipts, revision check, and a
  // confirmation only for the unchanged, unordered stored quote.
  async rpc(_name: string, args: Record<string, unknown>) {
    mock.rpcCalls++;
    const id = args.target_message_id as string;
    const existing = mock.receipts.get(id);
    if (existing) return { data: existing, error: null };
    if (mock.mode === "off") return { data: { paused: true }, error: null };
    if (mock.conflictsBeforeSave > 0) {
      // Another message for this conversation saved first.
      mock.conflictsBeforeSave--;
      mock.state = { state: { ...(mock.state?.state ?? { cart: [], name: "", token: "", quotedAt: null, orderId: null }) },
        revision: (mock.state?.revision ?? 0) + 1, updated_at: new Date().toISOString() };
    }
    if (args.expected_revision !== (mock.state?.revision ?? 0)) return { data: { conflict: true }, error: null };
    const state = structuredClone(args.next_state as Record<string, unknown>);
    let reply = String(args.response_text);
    if (args.confirm_order) {
      const stored = mock.state?.state;
      if (!stored || stored.orderId || !stored.token || JSON.stringify(stored) !== JSON.stringify(args.next_state)) {
        return { data: null, error: { code: "P0001" } };
      }
      mock.creates++;
      state.orderId = `order-${mock.creates}`; reply = `Order ${state.orderId} received for takeaway. Payment is due at collection.`;
    }
    if (args.handoff) mock.paused = true;
    mock.state = { state, revision: (mock.state?.revision ?? 0) + 1, updated_at: new Date().toISOString() };
    const receipt = { reply, sent: false }; mock.receipts.set(id, receipt);
    return { data: receipt, error: null };
  }
}) }));
import { handleWhatsAppOrderMessage } from "./whatsapp-ordering";
const send = (messageId: string, text: string, phone = "971500000077", sentAt?: string) => handleWhatsAppOrderMessage({
  restaurantId: "restaurant", phone, messageId, text, baseUrl: "https://example.com", sentAt
});
beforeEach(() => {
  mock.state = null; mock.receipts.clear(); mock.sent = []; mock.failSend = false; mock.mode = "approved";
  mock.paused = false; mock.creates = 0; mock.price = 2; mock.conflictsBeforeSave = 0; mock.profileName = "Ali"; mock.rpcCalls = 0;
});

describe("WhatsApp chat ordering webhook", () => {
  it("quotes an order and YES creates exactly one order across retries and repeats", async () => {
    await send("1", "2 karak");
    expect(mock.sent.at(-1)).toContain("Takeaway order for Ali");
    expect(mock.sent.at(-1)).toContain("Reply YES");
    expect(mock.creates).toBe(0);
    await send("2", "YES");
    await send("2", "YES"); // connector retry of the same message
    await send("3", "yes"); // customer repeats
    expect(mock.creates).toBe(1);
    expect(mock.sent.at(-1)).toContain("order-1 was already received");
  });

  it("recovers an unsent reply without applying the item twice", async () => {
    mock.failSend = true;
    await expect(send("1", "2 karak")).rejects.toThrow("not sent");
    mock.failSend = false; await send("1", "2 karak");
    expect(mock.state!.state.cart).toEqual([expect.objectContaining({ quantity: 2 })]);
    expect(mock.sent).toHaveLength(1);
  });

  it("retains an order after an acknowledgement failure", async () => {
    await send("1", "1 karak");
    mock.failSend = true; await expect(send("2", "yes")).rejects.toThrow();
    mock.failSend = false; await send("2", "yes");
    expect(mock.creates).toBe(1); expect(mock.sent.at(-1)).toContain("order-1 received");
  });

  it("re-runs a turn after a revision conflict and still creates one order", async () => {
    await send("1", "1 karak");
    mock.conflictsBeforeSave = 1;
    await send("2", "yes");
    expect(mock.creates).toBe(1);
    expect(mock.rpcCalls).toBe(3);
  });

  it("gives up after repeated conflicts so the connector retries", async () => {
    await send("1", "1 karak");
    mock.conflictsBeforeSave = 3;
    await expect(send("2", "yes")).rejects.toThrow("Concurrent cart edit");
    expect(mock.creates).toBe(0);
  });

  it("requires a new YES when a price or the cart changes", async () => {
    await send("1", "1 karak");
    mock.price = 3; await send("2", "yes");
    expect(mock.creates).toBe(0); expect(mock.sent.at(-1)).toContain("Prices or options have changed");
    await send("3", "1 karak"); // edit after the new quote
    expect(mock.sent.at(-1)).toContain("2 × Karak");
    const sentBeforeLatestQuote = String(Math.floor(Date.parse(mock.state!.state.quotedAt as string) / 1000) - 120);
    await send("4", "yes", "971500000077", sentBeforeLatestQuote);
    expect(mock.creates).toBe(0);
    await send("5", "yes");
    expect(mock.creates).toBe(1);
  });

  it("asks for a pickup name when the WhatsApp profile has none", async () => {
    mock.profileName = null;
    await send("1", "1 karak");
    expect(mock.sent.at(-1)).toContain("What name should we use");
    await send("2", "yes");
    expect(mock.creates).toBe(0);
    await send("3", "Sara");
    await send("4", "yes");
    expect(mock.creates).toBe(1);
  });

  it("leaves non-order messages to the receptionist without storing anything", async () => {
    for (const [id, text] of [["1", "hi"], ["2", "what time do you close?"], ["3", "yes"]]) {
      expect(await send(id, text)).toBe(false);
    }
    expect(mock.state).toBeNull();
    expect(mock.receipts.size).toBe(0);
    expect(mock.sent).toEqual([]);
  });

  it("never offers staff-only items", async () => {
    await send("1", "1 family platter");
    expect(mock.sent.at(-1)).toContain("could not find “family platter”");
    expect(mock.state!.state.cart).toEqual([]);
  });

  it("follows the rollout mode", async () => {
    expect(await send("1", "1 karak", "971500000099")).toBe(false);
    mock.mode = "everyone";
    expect(await send("2", "1 karak", "971500000099")).toBe(true);
    mock.mode = "off";
    expect(await send("3", "1 karak")).toBe(false);
  });

  it("honours staff takeover", async () => {
    await send("1", "1 karak"); await send("2", "staff");
    expect(mock.paused).toBe(true); expect(mock.sent.at(-1)).toContain("Unsent order");
    expect(await send("3", "yes")).toBe(true);
    expect(mock.creates).toBe(0);
  });
});
