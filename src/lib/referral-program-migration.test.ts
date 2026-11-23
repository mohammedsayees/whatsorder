import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261214090000_referral_program.sql", import.meta.url),
  "utf8"
).toLowerCase();

describe("referral program migration", () => {
  it("is off by default, per restaurant, with the agreed defaults", () => {
    expect(migration).toContain("referral_enabled boolean not null default false");
    expect(migration).toContain("referral_points_each integer not null default 20");
    expect(migration).toContain("referral_redeem_points integer not null default 100");
    expect(migration).toContain("referral_reward_value numeric(10, 2) not null default 5");
  });

  it("keeps the new tables tenant-scoped, read-only to the browser and RLS-protected", () => {
    for (const table of ["referrals", "referral_point_transactions"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
      expect(migration).toContain(`revoke all on table public.${table} from anon, authenticated`);
      expect(migration).toContain(`grant select on table public.${table} to authenticated`);
    }
    expect(migration).not.toMatch(/grant\s+(insert|update|delete)[^;]*public\.referral/);
    expect(migration).toContain("references public.customers(id, restaurant_id)");
    expect(migration).toContain("references public.orders(id, restaurant_id)");
    expect(migration).toContain("public.is_restaurant_member(");
  });

  it("rewards each friend once, never themselves, and each side once per referral", () => {
    expect(migration).toContain("constraint referrals_referred_once unique (referred_customer_id)");
    expect(migration).toContain("check (referrer_customer_id <> referred_customer_id)");
    expect(migration).toContain("referral_point_transactions_earned_once");
    expect(migration).toContain("on conflict (referred_customer_id) do nothing");
  });

  it("awards on completion only, from a trigger that can never block the order", () => {
    expect(migration).toContain("after update of status on public.orders");
    expect(migration).toContain("new.status = 'completed' and old.status is distinct from 'completed'");
    expect(migration).toContain("exception when others then");
    expect(migration).toContain("raise warning");
    // The friend must be a new customer and the code must come from a referral link.
    expect(migration).toContain("earlier.status <> 'cancelled'");
    expect(migration).toContain("'^ref-[a-z0-9]{4,12}$'");
  });

  it("redeems under a row lock into a single-use, 30-day, assigned voucher", () => {
    expect(migration).toContain("for update;");
    expect(migration).toContain("'not enough points'");
    expect(migration).toContain("'assigned'");
    expect(migration).toContain("interval '30 days'");
    expect(migration).toContain("1, 1, true, 'assigned'");
  });

  it("makes every RPC service-role only", () => {
    for (const fn of [
      "get_or_create_referral_code(uuid, text)",
      "get_referral_summary(uuid, text)",
      "redeem_referral_points(uuid, text)"
    ]) {
      expect(migration).toContain(`revoke all on function public.${fn}`);
      expect(migration).toContain(`grant execute on function public.${fn} to service_role`);
    }
    expect(migration).toContain(
      "revoke all on function public.award_referral_points() from public, anon, authenticated"
    );
  });
});
