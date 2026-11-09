import { describe, expect, it } from "vitest";
import {
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
