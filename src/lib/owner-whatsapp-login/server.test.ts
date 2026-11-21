import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const insert = vi.fn().mockResolvedValue({ error: null });
const restaurantName = vi.fn().mockResolvedValue({ data: { name: "Chai Xpress" } });
const sendWhatsAppTemplate = vi.fn();

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    rpc,
    from: (table: string) =>
      table === "owner_auth_events"
        ? { insert }
        : { select: () => ({ eq: () => ({ maybeSingle: restaurantName }) }) }
  }),
  createEphemeralAuthClient: () => null
}));
vi.mock("@/lib/customer-auth/whatsapp-cloud", () => ({ sendWhatsAppTemplate }));

const { handleSendSmsHook } = await import("./server");

const REQUEST = {
  request_id: "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90",
  request_kind: "link",
  restaurant_id: "11111111-1111-4111-8111-111111111111",
  restaurant_user_id: "22222222-2222-4222-8222-222222222222"
};
const payload = { user: { phone: "971501234567" }, sms: { otp: "123456" } };

describe("handleSendSmsHook", () => {
  beforeEach(() => {
    rpc.mockReset();
    insert.mockClear();
    sendWhatsAppTemplate.mockReset();
  });

  it("refuses an OTP WhatsOrder did not request, and sends nothing", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const result = await handleSendSmsHook(payload);
    expect(result).toEqual({ ok: false, status: 403, message: "No login was requested for this number" });
    expect(rpc).toHaveBeenCalledWith("claim_owner_login_request_for_send", {
      target_phone_e164: "+971501234567",
      max_age_seconds: 120
    });
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads before touching the database", async () => {
    for (const bad of [null, {}, { user: { phone: "x" }, sms: { otp: "123456" } }, { user: { phone: "971501234567" }, sms: { otp: "12" } }]) {
      expect((await handleSendSmsHook(bad)).ok).toBe(false);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not send code-kind requests yet", async () => {
    rpc.mockResolvedValue({ data: [{ ...REQUEST, request_kind: "code" }], error: null });
    expect((await handleSendSmsHook(payload)).ok).toBe(false);
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it("sends the link template with the request id and code, and logs the send", async () => {
    rpc.mockResolvedValue({ data: [REQUEST], error: null });
    sendWhatsAppTemplate.mockResolvedValue("wamid.1");
    expect(await handleSendSmsHook(payload)).toEqual({ ok: true });
    expect(sendWhatsAppTemplate).toHaveBeenCalledWith("971501234567", "owner_login_link", "en", [
      { type: "body", parameters: [{ type: "text", text: "Chai Xpress" }] },
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: `${REQUEST.request_id}.123456` }]
      }
    ]);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ event: "link_sent", wamid: "wamid.1" }));
    expect(JSON.stringify(insert.mock.calls)).not.toContain("123456");
  });

  it("reports a failed WhatsApp send to Supabase", async () => {
    rpc.mockResolvedValue({ data: [REQUEST], error: null });
    sendWhatsAppTemplate.mockResolvedValue(null);
    expect(await handleSendSmsHook(payload)).toEqual({ ok: false, status: 502, message: "WhatsApp send failed" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ event: "link_send_failed" }));
  });
});
