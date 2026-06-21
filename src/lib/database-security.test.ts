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
  const pilotOperationsMigration = readProjectFile(
    "supabase/20260620_p1_pilot_operations.sql"
  );
  const publicRestaurantProjectionMigration = readProjectFile(
    "supabase/migrations/20260620161000_p0_2a_add_public_restaurant_projection.sql"
  );
  const publicRestaurantEnforcementMigration = readProjectFile(
    "supabase/migrations/20260620162000_p0_2b_enforce_public_restaurant_projection.sql"
  );
  const leastPrivilegeMigration = readProjectFile(
    "supabase/migrations/20260620163000_p0_3_least_privilege_rls.sql"
  );
  const leastPrivilegeIntegrationTest = readProjectFile(
    "supabase/tests/p0_3_least_privilege.sql"
  );
  const dataModule = readProjectFile("src/lib/data.ts");
  const typeModule = readProjectFile("src/lib/types.ts");

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
      'supabase.rpc("create_order_with_customer_v4"'
    );
    expect(orderActions).not.toMatch(
      /\.from\(["']orders["']\)\s*\.insert\(/
    );
  });

  it("keeps phone normalization and operational events inside service-role RPCs", () => {
    expect(pilotOperationsMigration).toContain(
      "create or replace function public.normalize_customer_phone"
    );
    expect(pilotOperationsMigration).toContain(
      "create table if not exists public.order_status_events"
    );
    expect(pilotOperationsMigration).toContain(
      "create table if not exists public.order_print_events"
    );
    expect(pilotOperationsMigration).toContain(
      "create or replace function public.transition_order_status_and_record_event"
    );
    expect(pilotOperationsMigration).toContain(
      "create or replace function public.record_order_print_event"
    );
    expect(pilotOperationsMigration).toContain(
      "marketing_opt_in = order_consent_marketing"
    );
    expect(pilotOperationsMigration).toMatch(
      /grant execute on function public\.create_order_with_customer_v4\([\s\S]*?\) to service_role;/
    );
  });

  it("exposes restaurants publicly only through a curated projection", () => {
    expect(publicRestaurantProjectionMigration).toContain(
      "create or replace function public.get_public_restaurant"
    );
    expect(publicRestaurantEnforcementMigration).toContain(
      "revoke select on table public.restaurants from anon;"
    );
    expect(publicRestaurantProjectionMigration).not.toMatch(
      /get_public_restaurant[\s\S]*?owner_(name|email|phone)/
    );
    expect(publicRestaurantProjectionMigration).not.toMatch(
      /get_public_restaurant[\s\S]*?internal_notes/
    );
    expect(dataModule).toContain('.rpc("get_public_restaurant"');
    expect(dataModule).not.toMatch(
      /\.from\(["']restaurants["']\)\s*\.select\(["']\*["']\)/
    );
  });

  it("keeps private restaurant fields out of the public DTO", () => {
    const publicType = typeModule.match(
      /export type PublicRestaurant = \{([\s\S]*?)\n\};/
    )?.[1];

    expect(publicType).toBeTruthy();
    expect(publicType).not.toContain("owner_name");
    expect(publicType).not.toContain("owner_email");
    expect(publicType).not.toContain("owner_phone");
    expect(publicType).not.toContain("internal_notes");
  });

  it("replaces broad restaurant-user writes with role-scoped reads", () => {
    expect(leastPrivilegeMigration).toContain(
      'drop policy if exists "Restaurant users can manage own orders"'
    );
    expect(leastPrivilegeMigration).toContain(
      'create policy "Restaurant users can read own orders"'
    );
    expect(leastPrivilegeMigration).toContain(
      'create policy "Restaurant managers can read own customers"'
    );
    expect(leastPrivilegeMigration).toContain(
      "grant select on table public.orders to authenticated;"
    );
    expect(leastPrivilegeMigration).not.toMatch(
      /grant (insert|update|delete|all) on table public\.orders to authenticated;/i
    );
    expect(leastPrivilegeMigration).toContain(
      "alter default privileges for role postgres in schema public"
    );
    for (const table of [
      "restaurants",
      "menu_categories",
      "menu_items",
      "menu_offers",
      "orders",
      "customers",
      "loyalty_transactions",
      "customer_feedback",
      "restaurant_users"
    ]) {
      expect(leastPrivilegeMigration).toContain(
        `revoke all on table public.${table} from anon, authenticated;`
      );
    }
  });

  it("keeps service-only tables and functions inaccessible to browser roles", () => {
    expect(leastPrivilegeMigration).toContain(
      "revoke all on table public.order_submission_keys from anon, authenticated;"
    );
    expect(leastPrivilegeMigration).toContain(
      "revoke all on table public.feedback_requests from anon, authenticated;"
    );
    expect(leastPrivilegeMigration).toContain(
      "revoke all on function public.handle_new_user_profile()"
    );
    expect(leastPrivilegeMigration).toContain(
      "grant execute on function public.is_restaurant_member(uuid, text[])"
    );
  });

  it("has a rollback-only database role matrix test", () => {
    expect(leastPrivilegeIntegrationTest).toContain("begin;");
    expect(leastPrivilegeIntegrationTest).toContain("rollback;");
    expect(leastPrivilegeIntegrationTest).toContain(
      "Staff direct order update unexpectedly succeeded"
    );
    expect(leastPrivilegeIntegrationTest).toContain(
      "Manager direct customer update unexpectedly succeeded"
    );
    expect(leastPrivilegeIntegrationTest).toContain(
      "Owner direct restaurant update unexpectedly succeeded"
    );
    expect(leastPrivilegeIntegrationTest).toContain(
      "Realtime order SELECT privilege was removed"
    );
    expect(leastPrivilegeIntegrationTest).toContain(
      "transition_order_status_and_record_event"
    );
    expect(leastPrivilegeIntegrationTest).toContain(
      "record_order_print_event"
    );
  });
});
