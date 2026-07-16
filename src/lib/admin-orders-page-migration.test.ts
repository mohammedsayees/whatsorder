import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260717110000_admin_orders_page_rpc.sql",
    import.meta.url
  ),
  "utf8"
).toLowerCase();

describe("admin orders page RPC migration", () => {
  it("scopes the complete source set to one restaurant", () => {
    expect(migration).toContain(
      "where orders.restaurant_id = target_restaurant_id"
    );
    expect(migration).toContain("target_restaurant_id is null");
  });

  it("keeps execution service-role only", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain(
      "from public, anon, authenticated"
    );
    expect(migration).toContain("to service_role");
    expect(migration).not.toContain("security definer");
  });

  it("aggregates all fulfilment counts in the same query", () => {
    expect(migration).toContain(
      "count(*) filter (where fulfilment_type = 'delivery')"
    );
    expect(migration).toContain(
      "count(*) filter (where fulfilment_type = 'car_pickup')"
    );
  });
});
