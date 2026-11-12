import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261113100000_admin_order_queue_source_filter.sql", import.meta.url),
  "utf8"
).toLowerCase();
const v3 = readFileSync(
  new URL("../../supabase/migrations/20261111070000_admin_order_queue_search.sql", import.meta.url),
  "utf8"
).toLowerCase();

describe("admin order queue source filter migration", () => {
  it("adds v4 without dropping v3", () => {
    expect(migration).toContain("create or replace function public.get_admin_orders_page_v4(");
    expect(migration).not.toContain("drop function");
    expect(migration).toContain("target_source text default 'all'");
  });

  it("validates the source and filters before counting, inside one restaurant", () => {
    expect(migration).toContain("selected_source not in ('all', 'customer', 'staff', 'whatsapp_chat')");
    expect(migration).toContain(
      "where orders.restaurant_id = target_restaurant_id\n      and (selected_source = 'all' or orders.source = selected_source)"
    );
  });

  it("keeps v3's queue logic otherwise unchanged", () => {
    const body = (sql: string) => sql.slice(sql.indexOf("status_counts as ("), sql.indexOf("into result"));
    expect(body(migration)).toBe(body(v3));
  });

  it("stays service-role only", () => {
    expect(migration).toContain("security invoker");
    expect(migration).not.toContain("security definer");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});
