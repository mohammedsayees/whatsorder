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
  const publicPolicyHelperMigration = readProjectFile(
    "supabase/migrations/20260620163100_p0_3_allow_public_policy_helpers.sql"
  );
  const tenantForeignKeysMigration = readProjectFile(
    "supabase/migrations/20260621100000_p0_4_tenant_consistent_foreign_keys.sql"
  );
  const tenantForeignKeysIntegrationTest = readProjectFile(
    "supabase/tests/p0_4_tenant_consistent_foreign_keys.sql"
  );
  const shiftCashMigration = readProjectFile(
    "supabase/migrations/20260621120000_lightweight_shift_cash_summary.sql"
  );
  const shiftCashIntegrationTest = readProjectFile(
    "supabase/tests/shift_cash_summary.sql"
  );
  const reviewFixIntegrationTest = readProjectFile(
    "supabase/tests/security_reliability_fixes.sql"
  );
  const reviewFixMigration = readProjectFile(
    "supabase/migrations/20260713000000_security_and_reliability_fixes.sql"
  );
  const orderAdditionsMigration = readProjectFile(
    "supabase/migrations/20260714130000_order_additions.sql"
  );
  const orderAdditionsIntegrationTest = readProjectFile(
    "supabase/tests/order_item_additions.sql"
  );
  const orderOfferCapsMigration = readProjectFile(
    "supabase/migrations/20260714131000_enforce_order_offer_caps.sql"
  );
  const localizationMigration = readProjectFile(
    "supabase/migrations/20260714150000_multi_country_localization.sql"
  );
  const localizationOperationsMigration = readProjectFile(
    "supabase/migrations/20260714151000_multi_country_operational_time.sql"
  );
  const indiaOperationsMigration = readProjectFile(
    "supabase/migrations/20260714152000_india_payments_and_customer_segments.sql"
  );
  const localizationIntegrationTest = readProjectFile(
    "supabase/tests/multi_country_localization.sql"
  );
  const dailyCoachMigration = readProjectFile(
    "supabase/migrations/20260715100000_daily_coach_period_insights.sql"
  );
  const dailyCoachIntegrationTest = readProjectFile(
    "supabase/tests/daily_coach_insights.sql"
  );
  const inviteActions = readProjectFile("src/app/auth/invite/actions.ts");
  const readme = readProjectFile("README.md");
  const setupGuide = readProjectFile("SUPABASE_SETUP.md");
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

  it("derives replayed consent from the persisted idempotent order", () => {
    expect(reviewFixMigration).toContain(
      "marketing_opt_in = persisted_order.consent_marketing"
    );
    expect(reviewFixMigration).toContain(
      "customer.phone = persisted_order.customer_phone"
    );
    expect(reviewFixMigration).not.toContain(
      "marketing_opt_in = order_consent_marketing"
    );
    expect(reviewFixIntegrationTest).toContain(
      "Idempotent replay changed another customer consent"
    );
  });

  it("serializes rate-limit decisions per restaurant and fingerprint", () => {
    expect(reviewFixMigration).toContain("pg_advisory_xact_lock");
    expect(reviewFixMigration).toContain(
      "target_restaurant_id::text || ':' || target_client_fingerprint"
    );
  });

  it("requires a single-use membership-bound password setup proof", () => {
    expect(reviewFixMigration).toContain("password_setup_token_hash");
    expect(reviewFixMigration).toContain("password_setup_expires_at");
    expect(inviteActions).toContain("invitePasswordSetupCookieName");
    expect(inviteActions).toContain(
      '.eq("password_setup_token_hash", tokenHash)'
    );
    expect(inviteActions).toContain('.select("id,restaurant_id")');
    expect(inviteActions).toContain("password_setup_token_hash: null");
  });

  it("documents the complete security migration sequence", () => {
    for (const guide of [readme, setupGuide]) {
      expect(guide).toContain(
        "20260620162000_p0_2b_enforce_public_restaurant_projection.sql"
      );
      expect(guide).toContain(
        "20260620163000_p0_3_least_privilege_rls.sql"
      );
      expect(guide).toContain(
        "20260620163100_p0_3_allow_public_policy_helpers.sql"
      );
      expect(guide).toContain(
        "20260713000000_security_and_reliability_fixes.sql"
      );
    }
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
      /export type PublicRestaurant = (?:Partial<RestaurantLocalization> & )?\{([\s\S]*?)\n\};/
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
    expect(leastPrivilegeIntegrationTest).toContain(
      "Anon public menu SELECT failed"
    );
  });

  it("lets anon evaluate boolean policy helpers without granting private reads", () => {
    expect(publicPolicyHelperMigration).toContain(
      "grant execute on function public.is_restaurant_member(uuid, text[])"
    );
    expect(publicPolicyHelperMigration).toContain(
      "grant execute on function public.is_super_admin()"
    );
    expect(publicPolicyHelperMigration).toContain(
      "grant execute on function public.is_public_restaurant(uuid)"
    );
    expect(publicPolicyHelperMigration).toContain(
      "grant execute on function public.get_public_restaurant(text)"
    );
    expect(leastPrivilegeMigration).not.toContain(
      "grant select on table public.restaurants to anon;"
    );
    expect(leastPrivilegeMigration).not.toContain(
      "grant select on table public.orders to anon;"
    );
  });

  it("enforces tenant-consistent relationships at the database boundary", () => {
    for (const constraint of [
      "menu_items_category_tenant_fkey",
      "menu_offers_item_tenant_fkey",
      "feedback_requests_order_tenant_fkey",
      "customer_feedback_order_tenant_fkey",
      "loyalty_transactions_customer_tenant_fkey",
      "loyalty_transactions_order_tenant_fkey",
      "order_submission_keys_order_tenant_fkey",
      "order_status_events_order_tenant_fkey",
      "order_print_events_order_tenant_fkey"
    ]) {
      expect(tenantForeignKeysMigration).toContain(constraint);
      expect(tenantForeignKeysMigration).toContain(
        `validate constraint ${constraint}`
      );
    }
    expect(tenantForeignKeysMigration).toContain(
      "P0-4 blocked:"
    );
    expect(tenantForeignKeysIntegrationTest).toContain("begin;");
    expect(tenantForeignKeysIntegrationTest).toContain("rollback;");
    expect(tenantForeignKeysIntegrationTest).toContain(
      "Cross-tenant menu item unexpectedly succeeded"
    );
    expect(tenantForeignKeysIntegrationTest).toContain(
      "Cross-tenant feedback request unexpectedly succeeded"
    );
  });

  it("keeps shift cash tenant-scoped and service-action only", () => {
    expect(shiftCashMigration).toContain(
      "create unique index if not exists idx_restaurant_shifts_one_open"
    );
    expect(shiftCashMigration).toContain(
      "constraint orders_shift_tenant_fkey"
    );
    expect(shiftCashMigration).toContain("public.is_restaurant_member(");
    expect(shiftCashMigration).toContain(
      "revoke all on table public.restaurant_shifts from anon, authenticated;"
    );
    expect(shiftCashMigration).toContain(
      "grant execute on function public.close_restaurant_shift("
    );
    expect(shiftCashMigration).toMatch(
      /shift\.opening_cash_amount\s*\+\s*completed\.completed_cash_order_total\s*-\s*paid_outs\.cash_paid_out_total/
    );
    expect(shiftCashMigration).toContain(
      "and nullif(trim(requested_closing_note), '') is null"
    );
    expect(shiftCashMigration).toContain(
      "if target_status = 'Completed' and active_shift_id is not null then"
    );
    expect(shiftCashMigration).toContain(
      "and shift_id is null;"
    );
    expect(shiftCashIntegrationTest).toContain(
      "Second open shift unexpectedly succeeded"
    );
    expect(shiftCashIntegrationTest).toContain(
      "Cross-tenant shift assignment unexpectedly succeeded"
    );
    expect(shiftCashIntegrationTest).toContain("rollback;");
  });

  it("keeps order additions tenant-consistent, idempotent, and service-role only", () => {
    expect(orderAdditionsMigration).toContain("orders_parent_tenant_fkey");
    expect(orderAdditionsMigration).toContain(
      "order_item_addition_parent_tenant_fkey"
    );
    expect(orderAdditionsMigration).toContain(
      "unique (restaurant_id, client_order_id)"
    );
    expect(orderAdditionsMigration).toMatch(
      /revoke all on function public\.add_items_to_restaurant_order\([\s\S]*?\) from public, anon, authenticated;/
    );
    expect(orderAdditionsMigration).toMatch(
      /grant execute on function public\.add_items_to_restaurant_order\([\s\S]*?\) to service_role;/
    );
    expect(orderAdditionsMigration).toContain(
      "public.is_restaurant_member(restaurant_id)"
    );
    expect(orderAdditionsIntegrationTest).toContain(
      "Idempotent amendment replay duplicated items"
    );
    expect(orderAdditionsIntegrationTest).toContain(
      "Cross-tenant order addition unexpectedly succeeded"
    );
    expect(orderAdditionsIntegrationTest).toContain("rollback;");
    expect(orderOfferCapsMigration).toContain(
      "before insert or update of items on public.orders"
    );
    expect(orderOfferCapsMigration).toContain("Offer quantity limit exceeded");
    expect(orderAdditionsIntegrationTest).toContain(
      "Combined offer cap unexpectedly succeeded"
    );
  });

  it("constrains localization per tenant without expanding public access", () => {
    expect(localizationMigration).toContain(
      "restaurants_supported_country_profile_check"
    );
    expect(localizationMigration).toContain("country_code = 'IN'");
    expect(localizationMigration).toContain("currency_code = 'INR'");
    expect(localizationMigration).toContain("time_zone = 'Asia/Kolkata'");
    expect(localizationMigration).toMatch(
      /revoke all on function public\.get_public_restaurant\(text\)[\s\S]*?from public, anon, authenticated;/
    );
    expect(localizationOperationsMigration).toContain(
      "public.is_restaurant_open_at("
    );
    expect(localizationOperationsMigration).toContain(
      "now() at time zone tenant.time_zone"
    );
    expect(indiaOperationsMigration).toContain("payment_method = 'UPI'");
    expect(indiaOperationsMigration).toMatch(
      /revoke all on function public\.get_customer_segment_page[\s\S]*?from public, anon, authenticated;/
    );
    expect(indiaOperationsMigration).toContain(
      "where o.restaurant_id = p_restaurant_id"
    );
    expect(localizationIntegrationTest).toContain(
      "Invalid India/AED profile unexpectedly succeeded"
    );
    expect(localizationIntegrationTest).toContain("rollback;");
  });

  it("keeps Daily Coach insights tenant-scoped and service-role only", () => {
    expect(dailyCoachMigration).toContain("where o.restaurant_id = rid");
    expect(dailyCoachMigration).toContain("and o.status = 'Completed'");
    expect(dailyCoachMigration).toMatch(
      /revoke all on function public\.daily_coach_insights\(uuid, date\)[\s\S]*?from public, anon, authenticated;/
    );
    expect(dailyCoachMigration).toMatch(
      /grant execute on function public\.daily_coach_insights\(uuid, date\)[\s\S]*?to service_role;/
    );
    expect(dailyCoachMigration).toContain("having count(*) >= 3");
    expect(dailyCoachIntegrationTest).toContain(
      "Cross-tenant order must never affect Tenant A"
    );
    expect(dailyCoachIntegrationTest).toContain("rollback;");
  });
});
