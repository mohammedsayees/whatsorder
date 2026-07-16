import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260717150000_whatsapp_message_tenant_fk.sql",
    import.meta.url
  ),
  "utf8"
).toLowerCase();

describe("WhatsApp message tenant foreign key migration", () => {
  it("ties every message to a conversation in the same restaurant", () => {
    expect(migration).toContain("unique (id, restaurant_id)");
    expect(migration).toContain("foreign key (conversation_id, restaurant_id)");
    expect(migration).toContain(
      "references public.whatsapp_conversations(id, restaurant_id)"
    );
  });
});
