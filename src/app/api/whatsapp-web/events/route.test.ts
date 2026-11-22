import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const withdraw = vi.fn(async (..._args: unknown[]) => true);
const sendText = vi.fn(async (..._args: unknown[]) => "web:reply");
const handleOrder = vi.fn(async (..._args: unknown[]) => false);
const generateAi = vi.fn();
const recordOutbound = vi.fn(async (..._args: unknown[]) => undefined);
const mintLink = vi.fn(async (..._args: unknown[]) => "tok-123");
let existingMessage: { id: string } | null = null;

vi.mock("@/lib/whatsapp-web-signing", () => ({
  CONNECTOR_SIGNATURE_HEADER: "x-sig",
  CONNECTOR_TIMESTAMP_HEADER: "x-ts",
  verifyConnectorPayload: () => true
}));
vi.mock("@/lib/chat-inbox", () => ({
  getChatConversationByPhone: vi.fn(),
  getChatMessages: vi.fn(async () => []),
  isAiReplyBudgetExhausted: vi.fn(async () => false),
  isRecentDuplicateBotReply: vi.fn(),
  isChatAutomationActive: vi.fn(),
  maskCustomerLinkToken: (body: string) => body.replace(/([?&]token=)[^&\s]+/g, "$1•••"),
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
const storeMedia = vi.fn(async (..._args: unknown[]) => true);
vi.mock("@/lib/chat-media", () => ({
  storeChatMediaBytes: (...args: unknown[]) => storeMedia(...args)
}));
vi.mock("@/lib/marketing/consent", () => ({
  withdrawMarketingConsentByPhone: (...args: unknown[]) => withdraw(...args)
}));
vi.mock("@/lib/customer-auth/tokens", () => ({
  mintLinkToken: (...args: unknown[]) => mintLink(...args)
}));
const verifyStampCode = vi.fn((..._args: unknown[]): string | null => null);
const claimStamp = vi.fn(async (..._args: unknown[]) => ({
  ok: true as const, outcome: "stamped" as const, stamps: 5, required: 7, reward: "Free Crunch Burger"
}));
vi.mock("@/lib/customer-auth/stamp-claim-code", () => ({
  verifyStampClaimCode: (...args: unknown[]) => verifyStampCode(...args)
}));
vi.mock("@/lib/customer-auth/stamp-claim-server", () => ({
  claimOrderStampForPhone: (...args: unknown[]) => claimStamp(...args)
}));
// Off by default so the AI receptionist only runs in tests that opt in.
let planAllowed = false;
vi.mock("@/lib/plan-gates", () => ({
  planAllowsOrFalse: vi.fn(async () => planAllowed)
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
      if (table === "restaurants") return { data: { name: "Chai Xpress", slug: "chaixpress" } };
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
  planAllowed = false;
  for (const mock of [storeMedia, withdraw, sendText, handleOrder, generateAi, recordOutbound, mintLink, verifyStampCode, claimStamp, vi.mocked(after)]) {
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

describe("WhatsApp Web connector sign-in keyword", () => {
  it("replies with a one-time link to the account page and skips ordering and the AI", async () => {
    const response = await POST(messageEvent("Login"));
    expect(response.status).toBe(200);
    expect(mintLink).toHaveBeenCalledWith({ restaurantId: "rest-1", phone: "971500000001" });
    expect(sendText).toHaveBeenCalledTimes(1);
    const [restaurantId, to, reply] = sendText.mock.calls[0] as [string, string, string];
    expect(restaurantId).toBe("rest-1");
    expect(to).toBe("971500000001");
    expect(reply).toContain("Chai Xpress");
    expect(reply).toContain("/api/customer/link?token=tok-123&next=%2Fr%2Fchaixpress%2Faccount");
    expect(handleOrder).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("stores only a redacted copy of the link in the chat history", async () => {
    await POST(messageEvent("حسابي"));
    const stored = recordOutbound.mock.calls[0][0] as { body: string; senderType: string };
    expect(stored.body).toContain("token=•••");
    expect(stored.body).not.toContain("tok-123");
    expect(stored.senderType).toBe("system");
  });

  it("does not send a second link on a connector retry", async () => {
    existingMessage = { id: "row" };
    await POST(messageEvent("login"));
    expect(mintLink).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect(handleOrder).not.toHaveBeenCalled();
  });

  it("adds a receipt's stamp for the sender when the message carries its code", async () => {
    const code = "QwAAAAAAQACAAAAAAAAAAQ.tf3k2a.abcdefghijklmnopqrstuv";
    verifyStampCode.mockReturnValueOnce("43000000-0000-4000-8000-000000000001");
    await POST(messageEvent(`Login #${code}`));
    expect(verifyStampCode).toHaveBeenCalledWith(code, "rest-1");
    expect(claimStamp).toHaveBeenCalledWith({
      restaurantId: "rest-1",
      orderId: "43000000-0000-4000-8000-000000000001",
      phone: "971500000001"
    });
    const reply = sendText.mock.calls[0][2] as string;
    expect(reply.startsWith("Stamp added! 5/7 stamps · 2 more for a free Crunch Burger.")).toBe(true);
    expect(reply).toContain("/api/customer/link?token=tok-123&next=%2Fr%2Fchaixpress%2Faccount");
    expect(handleOrder).not.toHaveBeenCalled();
  });

  it("still signs in, without claiming, when the code is not genuine", async () => {
    await POST(messageEvent("Login #QwAAAAAAQACAAAAAAAAAAQ.tf3k2a.abcdefghijklmnopqrstuv"));
    expect(claimStamp).not.toHaveBeenCalled();
    const reply = sendText.mock.calls[0][2] as string;
    expect(reply).not.toContain("Stamp");
    expect(reply).toContain("token=tok-123");
  });

  it("leaves sentences that merely mention an account to ordering and the AI", async () => {
    await POST(messageEvent("my account shows the wrong order"));
    expect(mintLink).not.toHaveBeenCalled();
    expect(handleOrder).toHaveBeenCalledTimes(1);
  });
});

describe("WhatsApp Web connector voice notes", () => {
  it("stores the voice note so staff can play it, then runs the receptionist", async () => {
    const audio = Buffer.from("voice-bytes").toString("base64");
    await POST(new NextRequest("https://app.test/api/whatsapp-web/events", {
      method: "POST",
      body: JSON.stringify({
        type: "message", restaurantId: "rest-1", sessionId: "s1",
        message: { id: "a1", from: "971500000001", type: "audio", audioBase64: audio, audioMime: "audio/ogg; codecs=opus" }
      })
    }));
    expect(after).toHaveBeenCalledTimes(2);
    await (vi.mocked(after).mock.calls[0][0] as () => unknown)();
    expect(storeMedia).toHaveBeenCalledWith("rest-1", "web:a1", Buffer.from("voice-bytes"), "audio/ogg; codecs=opus");
    expect(handleOrder).not.toHaveBeenCalled();
  });
});

const chatInbox = await import("@/lib/chat-inbox");
const whatsappAi = await import("@/lib/whatsapp-ai");

describe("WhatsApp Web connector AI reply budget", () => {
  async function runReceptionistFor(body: string) {
    planAllowed = true;
    vi.mocked(whatsappAi.getWhatsAppChatbotSettings).mockResolvedValue({
      enabled: true,
      answer_text: true,
      answer_audio: true
    } as never);
    vi.mocked(chatInbox.getChatConversationByPhone).mockResolvedValue({ id: "conv-1" } as never);
    vi.mocked(chatInbox.isChatAutomationActive).mockReturnValue(true);
    await POST(messageEvent(body));
    for (const [task] of vi.mocked(after).mock.calls) {
      await (task as () => unknown)();
    }
  }

  it("skips the paid AI call once the budget is used up", async () => {
    vi.mocked(chatInbox.isAiReplyBudgetExhausted).mockResolvedValueOnce(true);
    await runReceptionistFor("is the karak ready?");
    expect(chatInbox.isAiReplyBudgetExhausted).toHaveBeenCalledWith("rest-1", "conv-1");
    expect(generateAi).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it("still answers while within budget", async () => {
    vi.mocked(chatInbox.isAiReplyBudgetExhausted).mockResolvedValueOnce(false);
    await runReceptionistFor("is the karak ready?");
    expect(generateAi).toHaveBeenCalledTimes(1);
  });
});
