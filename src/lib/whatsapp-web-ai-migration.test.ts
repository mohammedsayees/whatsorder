import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260723113000_whatsapp_web_ai_receptionist.sql"
  ),
  "utf8"
).toLowerCase();

describe("WhatsApp Web AI migration", () => {
  it("keeps every integration and setting tenant-owned", () => {
    expect(migration).toContain(
      "restaurant_id uuid not null unique references public.restaurants(id)"
    );
    expect(migration).toContain(
      "restaurant_id uuid primary key references public.restaurants(id)"
    );
  });

  it("keeps writes service-role only", () => {
    expect(migration).toContain(
      "revoke all on table public.whatsapp_integrations from anon, authenticated"
    );
    expect(migration).toContain(
      "revoke all on table public.whatsapp_chatbot_settings from anon, authenticated"
    );
    expect(migration).not.toMatch(/for\s+(insert|update|delete|all)\s+to\s+authenticated/);
  });

  it("limits reads to management roles and super admins", () => {
    expect(migration).toContain(
      "array['restaurant_admin', 'owner', 'manager']"
    );
    expect(migration).toContain("or public.is_super_admin()");
  });
});
