import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261111120000_smart_finance_foundation.sql"),
  "utf8"
).toLowerCase();

describe("smart finance foundation migration", () => {
  it("uses tenant-consistent foreign keys", () => {
    expect(migration).toContain("foreign key (category_id, restaurant_id)");
    expect(migration).toContain("references public.finance_categories(id, restaurant_id)");
  });

  it("keeps authenticated finance access read-only", () => {
    expect(migration).toContain("grant select on public.finance_role_permissions");
    expect(migration).not.toMatch(/for\s+(insert|update|delete|all)\s+to\s+authenticated/);
    expect(migration).toContain("smart finance authenticated write policy detected");
  });

  it("does not give super admins implicit finance visibility", () => {
    const financePolicies = migration.slice(migration.indexOf("alter table public.finance_role_permissions enable row level security"));
    expect(financePolicies).not.toContain("is_super_admin");
  });

  it("requires the tenant feature flag and configurable permission", () => {
    expect(migration).toContain("restaurant.finance_enabled = true");
    expect(migration).toContain("permission.can_view");
    expect(migration).toContain("permission.can_approve");
  });

  it("captures finance mutations in an append-only audit table", () => {
    expect(migration).toContain("create table public.finance_audit_events");
    expect(migration).toContain("create or replace function public.capture_finance_audit_event");
    expect(migration).toContain("after insert or update or delete on public.finance_expenses");
  });
});
