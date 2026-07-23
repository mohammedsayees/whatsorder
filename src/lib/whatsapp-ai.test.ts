import { describe, expect, it } from "vitest";
import { getWhatsAppChatbotSettings } from "./whatsapp-ai";

describe("WhatsApp AI settings", () => {
  it("stays disabled when Supabase is not configured", async () => {
    const result = await getWhatsAppChatbotSettings("restaurant-id");
    expect(result.enabled).toBe(false);
    expect(result.answer_text).toBe(true);
    expect(result.answer_audio).toBe(true);
  });
});
