import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const withdraw = vi.fn(async (..._args: unknown[]) => true);
const sendText = vi.fn(async (..._args: unknown[]) => "web:reply");
const handleOrder = vi.fn(async (..._args: unknown[]) => false);
const generateAi = vi.fn();
const recordOutbound = vi.fn(async (..._args: unknown[]) => undefined);
let existingMessage: { id: string } | null = null;

vi.mock("@/lib/whatsapp-web-signing", () => ({
  CONNECTOR_SIGNATURE_HEADER: "x-sig",
  CONNECTOR_TIMESTAMP_HEADER: "x-ts",
  verifyConnectorPayload: () => true
}));
vi.mock("@/lib/chat-inbox", () => ({
  getChatConversationByPhone: vi.fn(),
  isRecentDuplicateBotReply: vi.fn(),
  isChatAutomationActive: vi.fn(),
  recordBotReply: vi.fn(),
  recordInboundChatMessages: vi.fn(async () => undefined),
  recordOutboundChatMessage: (...args: unknown[]) => recordOutbound(...args),
  requestChatHandoff: vi.fn()
}));
vi.mock("@/lib/whatsapp-ai", () => ({
  generateWhatsAppAiReply: (...args: unknown[]) => generateAi(...args),
  getWhatsAppChatbotSettings: vi.fn(),
  shouldSendWhatsAppWelcome: vi.fn()
}));
vi.mock("@/lib/whatsapp-integration", () => ({
  sendRestaurantWhatsAppText: (...args: unknown[]) => sendText(...args)
}));
vi.mock("@/lib/whatsapp-ordering", () => ({
  handleWhatsAppOrderMessage: (...args: unknown[]) => handleOrder(...args)
}));
vi.mock("@/lib/marketing/consent", () => ({
  withdrawMarketingConsentByPhone: (...args: unknown[]) => withdraw(...args)
}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

function query(table: string) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    update: () => builder,
    maybeSingle: async () => {
      if (table === "whatsapp_integrations") {
        return { data: { restaurant_id: "rest-1", connector_session_id: "s1" } };
      }
      if (table === "whatsapp_messages") return { data: existingMessage };
      if (table === "restaurants") return { data: { name: "Chai Xpress" } };
      return { data: null };
    },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
  };
  return builder;
}
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => query(table) })
}));

const { POST } = await import("./route");
const { after } = await import("next/server");

function messageEvent(body: string) {
  return new NextRequest("https://app.test/api/whatsapp-web/events", {
    method: "POST",
    body: JSON.stringify({
      type: "message",
      restaurantId: "rest-1",
      sessionId: "s1",
      message: { id: "m1", from: "+971 50 000 0001", type: "text", body }
    })
  });
}

beforeEach(() => {
  existingMessage = null;
  for (const mock of [withdraw, sendText, handleOrder, generateAi, recordOutbound, vi.mocked(after)]) {
    mock.mockClear();
  }
});

describe("WhatsApp Web connector STOP handling", () => {
  it("withdraws consent, confirms once, and skips ordering and the AI receptionist", async () => {
    const response = await POST(messageEvent("UNSUBSCRIBE"));
    expect(response.status).toBe(200);
    expect(withdraw).toHaveBeenCalledWith("rest-1", "971500000001", "customer_replied_stop");
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(String(sendText.mock.calls[0][2])).toContain("Chai Xpress");
    expect(handleOrder).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("does not confirm twice on a connector retry", async () => {
    existingMessage = { id: "row" };
    await POST(messageEvent("إيقاف"));
    expect(withdraw).toHaveBeenCalledTimes(1);
    expect(sendText).not.toHaveBeenCalled();
    expect(handleOrder).not.toHaveBeenCalled();
  });

  it("asks the connector to retry when the withdrawal fails", async () => {
    withdraw.mockResolvedValueOnce(false);
    const response = await POST(messageEvent("STOP"));
    expect(response.status).toBe(503);
    expect(sendText).not.toHaveBeenCalled();
  });

  it("routes ordinary messages to ordering as before", async () => {
    await POST(messageEvent("stop the onions please"));
    expect(withdraw).not.toHaveBeenCalled();
    expect(handleOrder).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
  });
});
