import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

describe("order attribution (customer path)", () => {
  const actions = source("src/app/r/[restaurantSlug]/checkout/actions.ts");

  it("leaves the order RPC and its arguments unchanged", () => {
    const rpcCall = actions.slice(
      actions.indexOf('supabase.rpc("create_order_with_customer_v5"'),
      actions.indexOf("if (error) {", actions.indexOf('supabase.rpc("create_order_with_customer_v5"'))
    );
    expect(rpcCall).not.toContain("attribution");
  });

  it("records the source after the response, first-touch, scoped to the tenant", () => {
    expect(actions).toContain("sanitizeAttributionSource(formData.get(\"attribution_source\"))");
    expect(actions).toContain("after(() => recordOrderAttribution(restaurant.id, orderId, attributionSource))");
    const writer = actions.slice(actions.indexOf("async function recordOrderAttribution"));
    expect(writer).toContain('.eq("restaurant_id", restaurantId)');
    expect(writer).toContain('.eq("id", orderId)');
    expect(writer).toContain('.is("attribution_source", null)');
    // Never exported: an exported async function in a "use server" module is
    // a client-callable endpoint.
    expect(actions).not.toContain("export async function recordOrderAttribution");
  });

  it("carries ?src from the static menu to checkout without new dependencies", () => {
    const menu = source("src/components/customer/RestaurantMenu.tsx");
    expect(menu).toContain('currentQuery.get("src")');
    expect(menu).toContain("src=${encodeURIComponent(attributionSource)}");
    expect(menu).not.toContain("@/lib/attribution");
    expect(source("src/app/r/[restaurantSlug]/page.tsx")).toContain(
      'export const dynamic = "force-static"'
    );
    expect(source("src/app/r/[restaurantSlug]/checkout/page.tsx")).toContain(
      "sanitizeAttributionSource(query.src)"
    );
    expect(source("src/components/customer/CheckoutForm.tsx")).toContain(
      'name="attribution_source"'
    );
  });

  it("ships a migration-first nullable column with the P0-3 invariant", () => {
    const migration = source(
      "supabase/migrations/20261116140000_order_attribution_source.sql"
    ).toLowerCase();
    expect(migration).toContain("add column if not exists attribution_source text");
    expect(migration).toContain("orders_attribution_source_format");
    expect(migration).toContain("where attribution_source is not null");
    expect(migration).not.toContain("create policy");
    expect(migration).toContain("cmd in ('insert', 'update', 'delete', 'all')");
    expect(migration).toContain("notify pgrst, 'reload schema'");
  });
});
