import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20260718090000_poster_studio.sql",
    import.meta.url
  ),
  "utf8"
).toLowerCase();

describe("poster studio migration", () => {
  it("keeps posters tenant-scoped and read-only for members", () => {
    expect(migration).toContain("alter table public.posters enable row level security");
    expect(migration).toContain("public.is_restaurant_member(restaurant_id)");
    expect(migration).toContain("for select");
    // Service-role-only writes: no write policies may be declared.
    expect(migration).not.toContain("for insert");
    expect(migration).not.toContain("for update");
    expect(migration).not.toContain("for delete");
    expect(migration).not.toContain("for all");
  });

  it("self-verifies against write-policy regressions", () => {
    expect(migration).toContain("cmd <> 'select'");
    expect(migration).toContain("raise exception");
  });

  it("keeps the posters bucket private, png-only, under the WhatsApp cap", () => {
    expect(migration).toContain("'posters', 'posters', false");
    expect(migration).toContain("5 * 1024 * 1024");
    expect(migration).toContain("image/png");
    expect(migration).toContain("public = true");
  });

  it("keeps get_bestsellers service-role only and tenant-scoped", () => {
    expect(migration).toContain("security invoker");
    expect(migration).not.toContain("security definer");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("o.restaurant_id = rid");
    expect(migration).toContain("mi.restaurant_id = rid");
  });

  it("has the bestseller cold-start fallback", () => {
    expect(migration).toContain("not exists (select 1 from ranked)");
    expect(migration).toContain("is_featured desc");
  });
});
