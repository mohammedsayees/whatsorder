import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  state: null as null | { state: Record<string, unknown>; revision: number; updated_at: string },
  receipts: new Map<string, { reply: string; sent: boolean }>(),
  sent: [] as string[], failSend: false, mode: "approved" as "off" | "approved" | "everyone", paused: false,
  creates: 0, price: 2, conflictsBeforeSave: 0, profileName: "Ali" as string | null, rpcCalls: 0,
  logs: [] as Array<Record<string, unknown>>
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
    let since = "";
    let head = false;
    let update: Record<string, unknown> | undefined;
    const result = (): { data: unknown; error: null; count?: number } => {
      if (table === "whatsapp_order_parse_logs") {
        const rows = mock.logs.filter(l => Object.entries(filters).every(([k, v]) => l[k] === v) &&
          (!since || String(l.created_at) >= since));
        return head ? { data: null, count: rows.length, error: null } : { data: rows[0] ?? null, error: null };
      }
      if (table === "restaurants") return { data: { name: "Cafe", slug: "cafe", is_active: true,
        accepting_orders: true, pickup_enabled: true, status: "live", opening_hours_enabled: false,
        minimum_order_amount: 0, currency_code: "AED" }, error: null };
      if (table === "whatsapp_order_drafts") return { data: mock.state, error: null };
      const receipt = mock.receipts.get(filters.message_id);
      if (update && receipt) Object.assign(receipt, update);
      return { data: receipt ?? null, error: null };
    };
    const query = {
      select: (_columns?: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return query; },
      update: (value: Record<string, unknown>) => { update = value; return query; },
      upsert: async (row: Record<string, unknown>) => {
        if (!mock.logs.some(l => l.message_id === row.message_id && l.parser === row.parser)) {
          mock.logs.push({ ...row, created_at: new Date().toISOString() });
        }
        return { error: null };
      },
      gte: (_key: string, value: string) => { since = value; return query; },
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
  mock.logs = [];
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
  vi.stubEnv("GEMINI_API_KEY", "");
});

const gemini = (output: unknown) => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] })));
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};
const order = (lines: Array<Record<string, unknown>>) => ({ intent: "order", lines: lines.map(l =>
  ({ query: "karak", item_id: null, candidate_item_ids: [], quantity: 1, option_ids: [], note: "", ...l })) });

describe("Gemini parsing in the webhook", () => {
  it("logs the deterministic fast path and skips Gemini when it suffices", async () => {
    const fetchMock = gemini(order([]));
    await send("1", "2 karak");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mock.logs).toEqual([expect.objectContaining({ parser: "deterministic", outcome: "accepted", input_text: "2 karak",
      restaurant_id: "restaurant", conversation_id: "conversation", message_id: "1" })]);
  });

  it("uses Gemini for free text, prices from the menu, and logs the result", async () => {
    const fetchMock = gemini(order([{ query: "karaks", item_id: "i0", quantity: 2, note: "less sugar" }]));
    await send("1", "2 karaks with less sugar pls");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).not.toContain("Family platter");
    expect(mock.sent.at(-1)).toContain("2 × Karak — AED");
    expect(mock.sent.at(-1)).toContain("Notes: Karak: less sugar");
    expect(mock.logs.map(l => [l.parser, l.outcome])).toEqual([["deterministic", "rejected"], ["gemini", "accepted"]]);
    expect(mock.logs[1]).toMatchObject({ model: "gemini-2.5-flash", parsed: { raw: expect.any(Object), result: { kind: "add" } } });
  });

  it("reuses the logged Gemini result when the connector retries a message", async () => {
    const fetchMock = gemini(order([{ query: "karaks", item_id: "i0", quantity: 2 }]));
    mock.failSend = true;
    await expect(send("1", "2 karaks")).rejects.toThrow();
    mock.failSend = false;
    await send("1", "2 karaks");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mock.logs.filter(l => l.parser === "gemini")).toHaveLength(1);
  });

  it("hands Gemini's not-an-order back to the receptionist, logged and unsaved", async () => {
    gemini({ intent: "not_order", lines: [] });
    expect(await send("1", "order status")).toBe(false);
    expect(mock.state).toBeNull();
    expect(mock.logs.at(-1)).toMatchObject({ parser: "gemini", outcome: "rejected", reason: "not an order" });
  });

  it("falls back without guessing when Gemini output is invalid", async () => {
    gemini({ intent: "order", lines: [{ item_id: "i0", quantity: "lots" }] });
    await send("1", "i want loads of karaks");
    expect(mock.sent.at(-1)).toContain("could not find");
    expect(mock.state!.state.cart).toEqual([]);
    expect(mock.logs.at(-1)).toMatchObject({ parser: "gemini", outcome: "error", reason: "invalid line fields" });
  });

  it("stops calling Gemini after the hourly limit per conversation", async () => {
    const fetchMock = gemini(order([{ item_id: "i0" }]));
    const recent = new Date().toISOString();
    for (let i = 0; i < 20; i++) {
      mock.logs.push({ restaurant_id: "restaurant", conversation_id: "conversation", message_id: `old-${i}`, parser: "gemini", created_at: recent });
    }
    await send("1", "2 karaks");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mock.logs.at(-1)).toMatchObject({ parser: "deterministic", outcome: "rejected", reason: "gemini hourly limit reached" });
    expect(mock.sent.at(-1)).toContain("could not find");
  });

  it("never calls Gemini without an API key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await send("1", "2 karaks");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mock.logs.at(-1)).toMatchObject({ reason: "gemini not configured" });
  });
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
