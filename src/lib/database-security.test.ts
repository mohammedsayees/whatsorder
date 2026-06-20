import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("public order database boundary", () => {
  const migration = readProjectFile(
    "supabase/20260620_lock_down_public_order_creation.sql"
  );
  const orderActions = readProjectFile("src/app/actions.ts");

  it("removes direct order inserts from public Supabase roles", () => {
    expect(migration).toContain(
      'drop policy if exists "Public can insert new orders" on public.orders;'
    );
    expect(migration).toContain(
      "revoke insert on table public.orders from public;"
    );
    expect(migration).toContain(
      "revoke insert on table public.orders from anon;"
    );
    expect(migration).toContain(
      "revoke insert on table public.orders from authenticated;"
    );
  });

  it("keeps validated order creation service-role only", () => {
    expect(migration).toMatch(
      /revoke all on function public\.create_order_with_customer_v3\([\s\S]*?\) from public, anon, authenticated;/
    );
    expect(migration).toMatch(
      /grant execute on function public\.create_order_with_customer_v3\([\s\S]*?\) to service_role;/
    );
  });

  it("creates customer orders through the hardened RPC instead of a table insert", () => {
    expect(orderActions).toContain(
      'supabase.rpc("create_order_with_customer_v3"'
    );
    expect(orderActions).not.toMatch(
      /\.from\(["']orders["']\)\s*\.insert\(/
    );
  });
});
