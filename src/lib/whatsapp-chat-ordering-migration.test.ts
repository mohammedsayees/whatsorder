import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
import { isChatOrderingAllowed, type WhatsAppChatbotSettings } from "@/lib/whatsapp-ai";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261113090000_whatsapp_chat_ordering_v1.sql"),
  "utf8"
).toLowerCase();

describe("WhatsApp chat ordering v1 migration", () => {
  it("adds an off / approved / everyone rollout that defaults to off", () => {
    expect(migration).toContain("chat_ordering_mode text not null default 'off'");
    expect(migration).toContain("check (chat_ordering_mode in ('off', 'approved', 'everyone'))");
    expect(migration).toContain("set chat_ordering_mode = 'approved' where chat_ordering_enabled");
  });

  it("enforces the rollout mode inside the order command", () => {
    expect(migration).toContain("s.chat_ordering_mode='everyone'");
    expect(migration).toContain(
      "(s.chat_ordering_mode='approved' and conversation.customer_phone=any(s.chat_ordering_phones))"
    );
  });

  it("marks chat orders and keeps them unpaid", () => {
    expect(migration).toContain("check (source in ('customer', 'staff', 'whatsapp_chat'))");
    expect(migration).toContain("set payment_method=null, source='whatsapp_chat'");
  });

  it("re-checks options and prices in the creation transaction", () => {
    expect(migration).toContain("not public.whatsapp_chat_line_is_current(target_restaurant_id, line)");
    expect(migration).toContain("greatest(0, base_price + delta_sum) = (line->>'price')::numeric");
    expect(migration).toContain("line->>'offer_id' is not null");
  });

  it("keeps the parse log tenant-scoped, read-only to managers and time-limited", () => {
    expect(migration).toContain(
      "foreign key (conversation_id, restaurant_id)\n    references public.whatsapp_conversations(id, restaurant_id)"
    );
    expect(migration).toContain("revoke all on public.whatsapp_order_parse_logs from public, anon, authenticated");
    expect(migration).toContain("grant select on public.whatsapp_order_parse_logs to authenticated");
    expect(migration).toContain("array['restaurant_admin', 'owner', 'manager']");
    expect(migration).toContain("interval '90 days'");
    expect(migration).not.toMatch(/for\s+(insert|update|delete|all)\s+to\s+authenticated/);
  });

  it("keeps the order command and line check service-role only", () => {
    expect(migration).toContain(
      "revoke all on function public.apply_whatsapp_order_command(uuid,uuid,text,integer,jsonb,text,boolean,boolean) from public,anon,authenticated"
    );
    expect(migration).toContain(
      "revoke all on function public.whatsapp_chat_line_is_current(uuid, jsonb) from public, anon, authenticated"
    );
  });
});

describe("isChatOrderingAllowed", () => {
  const base: WhatsAppChatbotSettings = {
    enabled: true, answer_text: true, answer_audio: false, language_mode: "customer", tone: "friendly",
    welcome_message: null, handoff_message: "", human_pause_minutes: 0, chat_ordering_phones: ["971500000001"]
  };

  it("is off unless rolled out", () => {
    expect(isChatOrderingAllowed({ ...base, chat_ordering_mode: "off" }, "971500000001")).toBe(false);
    expect(isChatOrderingAllowed(base, "971500000001")).toBe(false);
  });

  it("limits approved mode to listed phones", () => {
    const settings = { ...base, chat_ordering_mode: "approved" as const };
    expect(isChatOrderingAllowed(settings, "971500000001")).toBe(true);
    expect(isChatOrderingAllowed(settings, "971500000002")).toBe(false);
  });

  it("opens everyone mode to any sender", () => {
    expect(isChatOrderingAllowed({ ...base, chat_ordering_mode: "everyone" }, "971500000002")).toBe(true);
  });

  it("falls back to the pilot switch for rows without a mode", () => {
    expect(isChatOrderingAllowed({ ...base, chat_ordering_enabled: true }, "971500000001")).toBe(true);
    expect(isChatOrderingAllowed({ ...base, chat_ordering_enabled: true }, "971500000002")).toBe(false);
  });

  it("requires automatic text replies", () => {
    const settings = { ...base, chat_ordering_mode: "everyone" as const };
    expect(isChatOrderingAllowed({ ...settings, enabled: false }, "971500000001")).toBe(false);
    expect(isChatOrderingAllowed({ ...settings, answer_text: false }, "971500000001")).toBe(false);
  });
});
