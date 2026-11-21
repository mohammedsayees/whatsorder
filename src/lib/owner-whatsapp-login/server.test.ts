import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A chainable stand-in for supabase-js query builders: every filter returns
// the same object, and awaiting it (or .maybeSingle()) yields the configured
// result for that table.
type Result = { data?: unknown; error?: unknown; count?: number | null };
const tableResults: Record<string, Result> = {};
const tableCalls: Record<string, Array<[string, unknown[]]>> = {};
function chain(table: string) {
  const result = () => tableResults[table] ?? { data: null, error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "not", "is", "gte", "order", "limit", "update", "delete", "in"]) {
    builder[method] = (...args: unknown[]) => {
      (tableCalls[table] ??= []).push([method, args]);
      return builder;
    };
  }
  builder.insert = (...args: unknown[]) => {
    (tableCalls[table] ??= []).push(["insert", args]);
    return Promise.resolve({ error: null });
  };
  builder.maybeSingle = () => Promise.resolve(result());
  builder.then = (resolve: (value: Result) => unknown) => Promise.resolve(result()).then(resolve);
  return builder;
}

const rpc = vi.fn();
const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();
const sendRestaurantWhatsAppText = vi.fn();
const getWhatsAppIntegration = vi.fn();
const SENDER_ID = "55555555-5555-4555-8555-555555555555";
const ACTIVE_SENDER = {
  provider: "whatsapp_web",
  status: "active",
  connector_session_id: "session-1"
};

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ rpc, from: (table: string) => chain(table) }),
  createEphemeralAuthClient: () => ({ auth: { signInWithOtp, verifyOtp } })
}));
vi.mock("@/lib/whatsapp-integration", () => ({ getWhatsAppIntegration, sendRestaurantWhatsAppText }));
vi.mock("@/lib/super-admin-data", () => ({ getPublicAppUrl: () => "https://app.example" }));

const { handleSendSmsHook, requestOwnerLoginCode, verifyOwnerLoginCode } = await import("./server");

const REQUEST = {
  request_id: "3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90",
  request_kind: "link",
  restaurant_id: "11111111-1111-4111-8111-111111111111",
  restaurant_user_id: "22222222-2222-4222-8222-222222222222"
};
const payload = { user: { phone: "971501234567" }, sms: { otp: "123456" } };

function enable(mode: "step1" | "step2") {
  vi.stubEnv("OWNER_WHATSAPP_LOGIN", mode);
  vi.stubEnv("OWNER_LOGIN_SENDER_RESTAURANT_ID", SENDER_ID);
  vi.stubEnv("WHATSAPP_WEB_CONNECTOR_URL", "https://connector.example");
  vi.stubEnv("WHATSAPP_WEB_CONNECTOR_SECRET", "secret");
  vi.stubEnv("SUPABASE_SEND_SMS_HOOK_SECRET", "v1,whsec_abc");
}

function events() {
  return (tableCalls.owner_auth_events ?? [])
    .filter(([method]) => method === "insert")
    .map(([, args]) => args[0] as Record<string, unknown>);
}

beforeEach(() => {
  rpc.mockReset();
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
  verifyOtp.mockReset();
  sendRestaurantWhatsAppText.mockReset();
  getWhatsAppIntegration.mockReset().mockResolvedValue(ACTIVE_SENDER);
  for (const key of Object.keys(tableResults)) delete tableResults[key];
  for (const key of Object.keys(tableCalls)) delete tableCalls[key];
  tableResults.restaurants = { data: { name: "Chai Xpress" }, error: null };
  enable("step1");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("handleSendSmsHook", () => {
  it("refuses an OTP WhatsOrder did not request, and sends nothing", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const result = await handleSendSmsHook(payload);
    expect(result).toEqual({ ok: false, status: 403, message: "No login was requested for this number" });
    expect(rpc).toHaveBeenCalledWith("claim_owner_login_request_for_send", {
      target_phone_e164: "+971501234567",
      max_age_seconds: 120
    });
    expect(sendRestaurantWhatsAppText).not.toHaveBeenCalled();
  });

  it("rejects malformed payloads before touching the database", async () => {
    for (const bad of [null, {}, { user: { phone: "x" }, sms: { otp: "123456" } }, { user: { phone: "971501234567" }, sms: { otp: "12" } }]) {
      expect((await handleSendSmsHook(bad)).ok).toBe(false);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not send code requests unless step 2 is on", async () => {
    rpc.mockResolvedValue({ data: [{ ...REQUEST, request_kind: "code" }], error: null });
    expect((await handleSendSmsHook(payload)).ok).toBe(false);
    expect(sendRestaurantWhatsAppText).not.toHaveBeenCalled();
  });

  it("sends the code as plain text from WhatsOrder's number when step 2 is on", async () => {
    enable("step2");
    rpc.mockResolvedValue({ data: [{ ...REQUEST, request_kind: "code" }], error: null });
    sendRestaurantWhatsAppText.mockResolvedValue("web:2");
    expect(await handleSendSmsHook(payload)).toEqual({ ok: true });
    expect(getWhatsAppIntegration).toHaveBeenCalledWith(SENDER_ID);
    const [sender, to, body] = sendRestaurantWhatsAppText.mock.calls[0];
    expect(sender).toBe(SENDER_ID);
    expect(to).toBe("971501234567");
    expect(body).toContain("\n\n123456\n\n");
    expect(events()).toEqual([expect.objectContaining({ event: "code_sent", wamid: "web:2" })]);
    expect(JSON.stringify(events())).not.toContain("123456");
  });

  it("sends the one-tap link as plain text, and logs the send", async () => {
    rpc.mockResolvedValue({ data: [REQUEST], error: null });
    sendRestaurantWhatsAppText.mockResolvedValue("web:1");
    expect(await handleSendSmsHook(payload)).toEqual({ ok: true });
    const [sender, to, body] = sendRestaurantWhatsAppText.mock.calls[0];
    expect(sender).toBe(SENDER_ID);
    expect(to).toBe("971501234567");
    expect(body).toContain(`https://app.example/auth/wa/${REQUEST.request_id}.123456`);
    expect(body).toContain("Chai Xpress");
    expect(events()).toEqual([expect.objectContaining({ event: "link_sent", wamid: "web:1" })]);
    expect(JSON.stringify(events())).not.toContain("123456");
  });

  it("never sends when WhatsOrder's number is disconnected", async () => {
    rpc.mockResolvedValue({ data: [REQUEST], error: null });
    getWhatsAppIntegration.mockResolvedValue({ ...ACTIVE_SENDER, status: "disconnected" });
    expect(await handleSendSmsHook(payload)).toEqual({ ok: false, status: 502, message: "WhatsApp send failed" });
    expect(sendRestaurantWhatsAppText).not.toHaveBeenCalled();
    expect(events()).toEqual([expect.objectContaining({ event: "link_send_failed" })]);
  });

  it("never sends from a café's Cloud number or anything but the web connector", async () => {
    rpc.mockResolvedValue({ data: [REQUEST], error: null });
    getWhatsAppIntegration.mockResolvedValue({ ...ACTIVE_SENDER, provider: "cloud_api" });
    expect((await handleSendSmsHook(payload)).ok).toBe(false);
    expect(sendRestaurantWhatsAppText).not.toHaveBeenCalled();
  });

  it("reports a failed WhatsApp send to Supabase", async () => {
    rpc.mockResolvedValue({ data: [REQUEST], error: null });
    sendRestaurantWhatsAppText.mockResolvedValue(null);
    expect(await handleSendSmsHook(payload)).toEqual({ ok: false, status: 502, message: "WhatsApp send failed" });
    expect(events()).toEqual([expect.objectContaining({ event: "link_send_failed" })]);
  });
});

describe("requestOwnerLoginCode", () => {
  const member = {
    id: REQUEST.restaurant_user_id,
    restaurant_id: REQUEST.restaurant_id,
    user_id: "33333333-3333-4333-8333-333333333333",
    restaurants: { status: "live" }
  };

  beforeEach(() => {
    enable("step2");
    rpc.mockImplementation((fn: string) =>
      Promise.resolve(
        fn === "check_owner_login_ip_rate_limit"
          ? { data: true, error: null }
          : fn === "reserve_owner_login_request"
            ? { data: "44444444-4444-4444-8444-444444444444", error: null }
            : { data: null, error: null }
      )
    );
    tableResults.owner_login_requests = { count: 0, data: null, error: null };
  });

  it("is off unless step 2 is switched on", async () => {
    enable("step1");
    expect(await requestOwnerLoginCode({ phoneInput: "0501234567", ip: "1.2.3.4" })).toEqual({ status: "not_configured" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is unavailable for every number while WhatsOrder's number is disconnected", async () => {
    getWhatsAppIntegration.mockResolvedValue(null);
    expect(await requestOwnerLoginCode({ phoneInput: "0501234567", ip: "1.2.3.4" })).toEqual({ status: "not_configured" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects something that is not a phone number", async () => {
    expect(await requestOwnerLoginCode({ phoneInput: "hello", ip: "1.2.3.4" })).toEqual({ status: "invalid_phone" });
  });

  it("applies the IP limit to every request", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await requestOwnerLoginCode({ phoneInput: "0501234567", ip: "1.2.3.4" })).toEqual({ status: "rate_limited" });
    expect(rpc.mock.calls[0][0]).toBe("check_owner_login_ip_rate_limit");
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("1.2.3.4");
  });

  it("answers an unknown number exactly like a known one, and sends nothing", async () => {
    tableResults.restaurant_users = { data: [], error: null };
    expect(await requestOwnerLoginCode({ phoneInput: "0501234567", ip: "1.2.3.4" })).toEqual({
      status: "accepted",
      phoneE164: "+971501234567"
    });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("sends nothing for a paused restaurant, with the same answer", async () => {
    tableResults.restaurant_users = { data: [{ ...member, restaurants: { status: "paused" } }], error: null };
    expect((await requestOwnerLoginCode({ phoneInput: "0501234567", ip: "1.2.3.4" })).status).toBe("accepted");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("reserves a code request with the cooldown and starts a Supabase OTP for a known number", async () => {
    tableResults.restaurant_users = { data: [member], error: null };
    expect(await requestOwnerLoginCode({ phoneInput: "050 123 4567", ip: "1.2.3.4" })).toEqual({
      status: "accepted",
      phoneE164: "+971501234567"
    });
    expect(rpc).toHaveBeenCalledWith(
      "reserve_owner_login_request",
      expect.objectContaining({
        target_kind: "code",
        target_phone_e164: "+971501234567",
        max_per_member: 1,
        member_window_seconds: 60,
        max_per_phone: 3,
        phone_window_seconds: 900
      })
    );
    expect(signInWithOtp).toHaveBeenCalledWith({
      phone: "971501234567",
      options: { shouldCreateUser: false, channel: "sms" }
    });
  });

  it("stays quiet when the daily cap is reached", async () => {
    tableResults.restaurant_users = { data: [member], error: null };
    tableResults.owner_login_requests = { count: 10, data: null, error: null };
    expect((await requestOwnerLoginCode({ phoneInput: "0501234567", ip: "1.2.3.4" })).status).toBe("accepted");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("stays quiet inside the resend cooldown", async () => {
    tableResults.restaurant_users = { data: [member], error: null };
    rpc.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === "check_owner_login_ip_rate_limit" ? true : null, error: null })
    );
    expect((await requestOwnerLoginCode({ phoneInput: "0501234567", ip: "1.2.3.4" })).status).toBe("accepted");
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});

describe("verifyOwnerLoginCode", () => {
  const started = { request_id: "44444444-4444-4444-8444-444444444444", restaurant_id: REQUEST.restaurant_id, restaurant_user_id: REQUEST.restaurant_user_id };
  const session = {
    access_token: "a",
    refresh_token: "r",
    expires_in: 3600,
    user: { id: "33333333-3333-4333-8333-333333333333", phone: "971501234567" }
  };

  beforeEach(() => {
    enable("step2");
  });

  it("counts the attempt before asking Supabase, and gives up when none are left", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await verifyOwnerLoginCode("+971501234567", "123456")).toEqual({ ok: false, reason: "expired" });
    expect(rpc).toHaveBeenCalledWith("start_owner_code_verification", {
      target_phone_e164: "+971501234567",
      max_attempts: 5
    });
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("rejects malformed codes without using an attempt", async () => {
    expect(await verifyOwnerLoginCode("+971501234567", "12ab56")).toEqual({ ok: false, reason: "wrong_code" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("logs a wrong code and does not finish the request", async () => {
    rpc.mockResolvedValue({ data: [started], error: null });
    verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "Token has expired or is invalid" } });
    expect(await verifyOwnerLoginCode("+971501234567", "000000")).toEqual({ ok: false, reason: "wrong_code" });
    expect(events()).toEqual([expect.objectContaining({ event: "login_failed" })]);
    expect(rpc).not.toHaveBeenCalledWith("finish_owner_code_login", expect.anything());
  });

  it("refuses a session for a different phone", async () => {
    rpc.mockResolvedValue({ data: [started], error: null });
    verifyOtp.mockResolvedValue({ data: { session: { ...session, user: { ...session.user, phone: "971509999999" } } }, error: null });
    expect((await verifyOwnerLoginCode("+971501234567", "123456")).ok).toBe(false);
  });

  it("signs in, marks the request used and activates waiting memberships of this login only", async () => {
    rpc.mockResolvedValue({ data: [started], error: null });
    verifyOtp.mockResolvedValue({ data: { session }, error: null });
    expect(await verifyOwnerLoginCode("+971501234567", "123456")).toEqual({
      ok: true,
      accessToken: "a",
      refreshToken: "r",
      expiresIn: 3600
    });
    expect(verifyOtp).toHaveBeenCalledWith({ phone: "971501234567", token: "123456", type: "sms" });
    expect(rpc).toHaveBeenCalledWith("finish_owner_code_login", { target_request_id: started.request_id });
    const memberCalls = tableCalls.restaurant_users ?? [];
    expect(memberCalls).toContainEqual(["eq", ["user_id", session.user.id]]);
    expect(memberCalls).toContainEqual(["eq", ["phone_e164", "+971501234567"]]);
    expect(memberCalls).toContainEqual(["is", ["accepted_at", null]]);
    expect(events()).toEqual([expect.objectContaining({ event: "login_succeeded" })]);
  });
});
