import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendWhatsAppText = vi.fn(async (_to: string, _body: string) => "wamid.reply");
const withdraw = vi.fn(async (..._args: unknown[]) => true);
const recordOutbound = vi.fn(async (..._args: unknown[]) => undefined);
const mintLinkToken = vi.fn(async (..._args: unknown[]) => "token");

vi.mock("@/lib/customer-auth/whatsapp-cloud", () => ({
  webhookAuthOutcome: () => "process",
  buildCustomerLinkUrl: () => "https://app.test/link",
  sendWhatsAppText: (to: string, body: string) => sendWhatsAppText(to, body)
}));
vi.mock("@/lib/customer-auth/tokens", () => ({
  mintLinkToken: (...args: unknown[]) => mintLinkToken(...args)
}));
vi.mock("@/lib/chat-inbox", () => ({
  applyChatMessageStatuses: vi.fn(),
  maskCustomerLinkToken: (body: string) => body,
  recordInboundChatMessages: vi.fn(async () => undefined),
  recordOutboundChatMessage: (...args: unknown[]) => recordOutbound(...args)
}));
vi.mock("@/lib/chat-media", () => ({ downloadChatMedia: vi.fn() }));
vi.mock("@/lib/data", () => ({
  getRestaurantBySlug: async () => ({ id: "rest-1", slug: "chaixpress", name: "Chai Xpress" })
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ upsert: async () => ({ error: null }) })
  })
}));
vi.mock("@/lib/whatsapp-cloud-tenant", () => ({
  cloudNumberOwnerSlug: () => "chaixpress",
  isPlatformCloudPhoneNumberId: () => true
}));
vi.mock("@/lib/marketing/consent", () => ({
  withdrawMarketingConsentByPhone: (...args: unknown[]) => withdraw(...args)
}));

const { POST } = await import("./route");

function delivery(messages: { from: string; body: string }[]) {
  return new NextRequest("https://app.test/api/whatsapp/webhook", {
    method: "POST",
    body: JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "pn" },
                messages: messages.map((message, index) => ({
                  id: `wamid.in.${index}`,
                  from: message.from,
                  type: "text",
                  text: { body: message.body }
                }))
              }
            }
          ]
        }
      ]
    })
  });
}

beforeEach(() => {
  sendWhatsAppText.mockClear();
  withdraw.mockClear();
  recordOutbound.mockClear();
  mintLinkToken.mockClear();
});

describe("Cloud webhook STOP handling", () => {
  it("withdraws consent for this restaurant, confirms once, and sends no deep link", async () => {
    const response = await POST(delivery([{ from: "971500000001", body: " stop " }]));
    expect(response.status).toBe(200);
    expect(withdraw).toHaveBeenCalledWith("rest-1", "971500000001", "customer_replied_stop");
    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppText.mock.calls[0][1]).toContain("unsubscribed");
    expect(mintLinkToken).not.toHaveBeenCalled();
  });

  it("handles Arabic keywords", async () => {
    await POST(delivery([{ from: "971500000001", body: "إلغاء" }]));
    expect(withdraw).toHaveBeenCalledTimes(1);
  });

  it("leaves ordinary messages (and other senders) on the normal path", async () => {
    await POST(
      delivery([
        { from: "971500000001", body: "STOP" },
        { from: "971500000002", body: "stop the onions please" }
      ])
    );
    expect(withdraw).toHaveBeenCalledTimes(1);
    expect(withdraw).toHaveBeenCalledWith("rest-1", "971500000001", "customer_replied_stop");
    expect(mintLinkToken).toHaveBeenCalledTimes(1);
    expect(mintLinkToken).toHaveBeenCalledWith({ restaurantId: "rest-1", phone: "971500000002" });
  });

  it("does not confirm when the withdrawal failed", async () => {
    withdraw.mockResolvedValueOnce(false);
    await POST(delivery([{ from: "971500000001", body: "STOP" }]));
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });
});
