import { describe, expect, it } from "vitest";
import {
  existingOrderReply,
  generateWhatsAppAiReply,
  getWhatsAppChatbotSettings,
  shouldSendWhatsAppWelcome,
  WELCOME_COOLDOWN_MS
} from "./whatsapp-ai";

describe("WhatsApp AI settings", () => {
  it("stays disabled when Supabase is not configured", async () => {
    const result = await getWhatsAppChatbotSettings("restaurant-id");
    expect(result.enabled).toBe(false);
    expect(result.answer_text).toBe(true);
    expect(result.answer_audio).toBe(true);
  });
});

describe("WhatsApp welcome cooldown", () => {
  const now = Date.parse("2026-07-26T12:00:00.000Z");

  it("welcomes a conversation with no previous bot reply", () => {
    expect(shouldSendWhatsAppWelcome(null, now)).toBe(true);
  });

  it("does not repeat the welcome during the same active conversation", () => {
    expect(
      shouldSendWhatsAppWelcome(
        new Date(now - WELCOME_COOLDOWN_MS + 1).toISOString(),
        now
      )
    ).toBe(false);
  });

  it("allows a new welcome after prolonged inactivity", () => {
    expect(
      shouldSendWhatsAppWelcome(
        new Date(now - WELCOME_COOLDOWN_MS).toISOString(),
        now
      )
    ).toBe(true);
  });
});

describe("WhatsApp receptionist conversation fixes", () => {
  const settings = {
    enabled: true,
    answer_text: true,
    answer_audio: true,
    language_mode: "customer" as const,
    tone: "friendly" as const,
    welcome_message: null,
    handoff_message: "Our team will reply shortly.",
    human_pause_minutes: 480
  };
  const base = { restaurantId: "r1", baseUrl: "https://x.test", settings };

  it.each(["Kk", "ok", "Okay!", "thanks", "👍", "Thank you"])(
    "does not reply to a bare acknowledgement (%s)",
    async (text) => {
      expect(await generateWhatsAppAiReply({ ...base, text })).toBeNull();
    }
  );

  it("hands a voice note with no audio to staff instead of guessing", async () => {
    const result = await generateWhatsAppAiReply({ ...base, text: "", isVoiceNote: true });
    expect(result?.handoff).toBe(true);
    expect(result?.reply).toMatch(/couldn't play your voice message/);
  });

  const order = {
    status: "Preparing",
    fulfilment_type: "delivery",
    created_at: "2026-11-19T17:40:00Z",
    has_delivery_location: false
  };

  it("answers 'I just made an order' with the order, not the menu link", () => {
    const result = existingOrderReply(
      "I just made an order and told you I will send location when I reach home",
      order,
      "Our team will reply shortly."
    );
    expect(result.reply).not.toMatch(/\/r\//);
    expect(result.reply).toMatch(/being prepared/);
    expect(result.reply).toMatch(/share your location/);
    expect(result.handoff).toBe(true);
  });

  it("gives a plain status when nothing else is needed", () => {
    const result = existingOrderReply(
      "where is my order",
      { ...order, fulfilment_type: "pickup", status: "Ready to Serve" },
      "x"
    );
    expect(result).toEqual({ reply: "Thank you! Your order is ready. We'll keep you updated.", handoff: false });
  });

  it("asks staff to check when no recent order is found for the number", () => {
    const result = existingOrderReply("I already ordered", null, "Our team will reply shortly.");
    expect(result.handoff).toBe(true);
    expect(result.reply).toMatch(/couldn't find a recent order/);
  });
});
