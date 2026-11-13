import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20261116120000_poster_generation_limits.sql",
    import.meta.url
  ),
  "utf8"
).toLowerCase();

describe("poster generation limits migration", () => {
  it("keeps the attempts table tenant-scoped and read-only for members", () => {
    expect(migration).toContain(
      "alter table public.poster_generation_attempts enable row level security"
    );
    expect(migration).toContain("public.is_restaurant_member(restaurant_id)");
    // Policy clauses only ("for update skip locked" in the retention query is fine).
    expect(migration).not.toMatch(/for (insert|update|delete|all)\s+to\s/);
    expect(migration.match(/create policy/g)).toHaveLength(1);
    expect(migration).toContain("cmd <> 'select'");
  });

  it("serialises rate-limit checks per restaurant", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("target_restaurant_id::text || ':poster-generate'");
  });

  it("only deletes never-sent posters with no send rows", () => {
    expect(migration).toContain("p.status = 'rendered'");
    expect(migration).toContain("not exists (\n        select 1 from public.marketing_sends s");
    expect(migration).toContain("for update skip locked");
  });

  it("keeps both functions service-role only and self-verifies", () => {
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).not.toContain("security definer");
    expect(migration).toContain("raise exception");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
