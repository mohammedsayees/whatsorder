import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261111070000_admin_order_queue_search.sql",
    import.meta.url
  ),
  "utf8"
).toLowerCase();

describe("admin order queue migration", () => {
  it("scopes search and every queue count to one restaurant", () => {
    expect(migration).toContain("where orders.restaurant_id = target_restaurant_id");
    expect(migration).toContain("target_restaurant_id is null");
    expect(migration).toContain("from searched_orders");
    expect(migration).toContain("position(normalized_search in lower(orders.id::text))");
    expect(migration).toContain("coalesce(orders.customer_phone, '')");
  });

  it("returns operational status and fulfilment counts with the page", () => {
    expect(migration).toContain("'preparing', status_counts.preparing_count");
    expect(migration).toContain("'ready', status_counts.ready_count");
    expect(migration).toContain("'out_for_delivery', status_counts.out_for_delivery_count");
    expect(migration).toContain("'delivery', fulfilment_counts.delivery_count");
  });

  it("keeps the RPC service-role-only", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).not.toContain("security definer");
  });
});
