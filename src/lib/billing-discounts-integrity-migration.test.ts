import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261110130000_billing_discounts_and_integrity.sql"
  ),
  "utf8"
);

describe("billing discounts and integrity migration", () => {
  it("stores contract prices with tenant-scoped audit history", () => {
    expect(migration).toContain("price_override numeric(10, 2)");
    expect(migration).toContain("create table if not exists public.subscription_price_events");
    expect(migration).toContain("foreign key (subscription_id, restaurant_id)");
    expect(migration).toContain("public.is_restaurant_member(subscription_price_events.restaurant_id)");
  });

  it("makes payment requests idempotent and rejects overpayments", () => {
    expect(migration).toContain("payments_idempotency_key_unique");
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0))");
    expect(migration).toContain("Payment exceeds the remaining invoice balance");
  });

  it("uses service-role-only transactional billing functions", () => {
    expect(migration).toContain("create or replace function public.issue_billing_invoice");
    expect(migration).toContain("create or replace function public.record_billing_payment");
    expect(migration).toContain("create or replace function public.void_billing_invoice");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});
