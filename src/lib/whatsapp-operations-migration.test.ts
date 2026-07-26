import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260726130000_whatsapp_operations.sql"
  ),
  "utf8"
).toLowerCase();

describe("WhatsApp operations migration", () => {
  it("adds assignment, handoff, direction, and sender attribution", () => {
    expect(migration).toContain(
      "assigned_to uuid references auth.users(id) on delete set null"
    );
    expect(migration).toContain("handoff_requested_at timestamptz");
    expect(migration).toContain("last_message_direction text");
    expect(migration).toContain("sender_type text");
  });

  it("keeps writes service-role only", () => {
    expect(migration).not.toMatch(
      /for\s+(insert|update|delete|all)\s+to\s+authenticated/
    );
    expect(migration).toContain(
      "whatsapp operational tables must remain service-role write only"
    );
  });

  it("keeps every operational index tenant-scoped", () => {
    expect(migration).toContain(
      "on public.whatsapp_conversations(restaurant_id, assigned_to"
    );
    expect(migration).toContain(
      "on public.whatsapp_conversations(restaurant_id, handoff_requested_at"
    );
    expect(migration).toContain(
      "on public.whatsapp_messages(restaurant_id, sender_type"
    );
  });
});
