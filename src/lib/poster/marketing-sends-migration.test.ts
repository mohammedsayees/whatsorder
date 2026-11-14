import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20261116090000_marketing_sends.sql",
    import.meta.url
  ),
  "utf8"
).toLowerCase();

describe("marketing_sends migration", () => {
  it("is tenant-scoped and read-only for members", () => {
    expect(migration).toContain("alter table public.marketing_sends enable row level security");
    expect(migration).toContain("public.is_restaurant_member(restaurant_id)");
    expect(migration).toContain("for select");
    expect(migration).not.toContain("for insert");
    expect(migration).not.toContain("for update");
    expect(migration).not.toContain("for delete");
    expect(migration).not.toContain("for all");
  });

  it("prevents double sends and supports the frequency cap", () => {
    expect(migration).toContain("unique (poster_id, customer_phone)");
    expect(migration).toContain("(restaurant_id, customer_phone, sent_at desc)");
    expect(migration).toContain("'queued', 'sending', 'sent', 'failed', 'skipped'");
  });

  it("pins each send to a poster of the same tenant and keeps it auditable", () => {
    expect(migration).toContain("foreign key (poster_id, restaurant_id)");
    expect(migration).toContain("references public.posters (id, restaurant_id)");
    expect(migration).toContain("on delete restrict");
  });

  it("self-verifies and reloads the schema", () => {
    expect(migration).toContain("cmd <> 'select'");
    expect(migration).toContain("raise exception");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
