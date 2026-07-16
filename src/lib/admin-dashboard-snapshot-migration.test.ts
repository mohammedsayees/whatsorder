import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260717120000_admin_dashboard_snapshot_rpc.sql",
    import.meta.url
  ),
  "utf8"
).toLowerCase();

describe("admin dashboard snapshot RPC migration", () => {
  it("uses the existing tenant-scoped aggregate functions", () => {
    expect(migration).toContain(
      "get_restaurant_dashboard_analytics(target_restaurant_id)"
    );
    expect(migration).toContain("target_restaurant_id,");
    expect(migration).toContain(
      "get_restaurant_commission_kept(target_restaurant_id)"
    );
  });

  it("scopes the daily summary to the same restaurant", () => {
    expect(migration).toContain(
      "where summary.restaurant_id = target_restaurant_id"
    );
  });

  it("keeps execution service-role only", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).not.toContain("security definer");
  });
});
