import { afterEach, describe, expect, it, vi } from "vitest";

let owns = true;
vi.mock("@/lib/whatsapp-cloud-tenant", () => ({
  restaurantOwnsCloudNumber: async () => owns
}));

const { NO_CLOUD_API_REASON, posterSendAvailability } = await import("./send-availability");

const saved = { id: process.env.WHATSAPP_PHONE_NUMBER_ID, token: process.env.WHATSAPP_ACCESS_TOKEN };
afterEach(() => {
  owns = true;
  process.env.WHATSAPP_PHONE_NUMBER_ID = saved.id;
  process.env.WHATSAPP_ACCESS_TOKEN = saved.token;
  if (saved.id === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (saved.token === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
});

describe("posterSendAvailability", () => {
  it("allows sending only with the Cloud API configured and owned by this restaurant", async () => {
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_ACCESS_TOKEN = "token";
    await expect(posterSendAvailability("rest-1")).resolves.toEqual({ ok: true });
    owns = false;
    await expect(posterSendAvailability("rest-1")).resolves.toEqual({ ok: false, reason: NO_CLOUD_API_REASON });
  });

  it("blocks sending (with the download/copy advice) when the Cloud API isn't configured", async () => {
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    process.env.WHATSAPP_ACCESS_TOKEN = "token";
    const result = await posterSendAvailability("rest-1");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/WhatsApp Web connection can't send posters/);
  });
});
