import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("self-serve demo activation contracts", () => {
  const migration = source(
    "supabase/migrations/20260723120000_self_serve_demo_activation.sql"
  );
  const demoAction = source("src/app/try/actions.ts");
  const claimAction = source("src/app/try/claim/actions.ts");
  const dashboard = source("src/app/admin/page.tsx");
  const demoBanner = source("src/components/customer/DemoStoreBanner.tsx");

  it("keeps claim proofs hashed, one-time, private, and service-role only", () => {
    expect(migration).toContain("claim_token_hash text");
    expect(migration).toContain("claim_token_hash = null");
    expect(migration).toContain("alter table public.demo_restaurant_claims enable row level security");
    expect(migration).toContain(
      "revoke all on table public.demo_restaurant_claims from public, anon, authenticated"
    );
    expect(migration).toMatch(
      /revoke all on function public\.claim_demo_restaurant\([\s\S]*?\) from public, anon, authenticated;/
    );
    expect(demoAction).toContain("hashDemoClaimToken(claimToken)");
    expect(demoAction).toContain("httpOnly: true");
    expect(demoAction).not.toMatch(/claimToken:\s*claimToken/);
    expect(claimAction).toContain('admin.rpc("claim_demo_restaurant"');
  });

  it("claims the tenant in place with a 14-day no-card trial and owner uniqueness", () => {
    expect(migration).toContain("where id = claimed_restaurant_id");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("This email is already assigned to another restaurant");
    expect(migration).toContain("claimed_at_value + interval '14 days'");
    expect(migration).toContain("status = 'trialing'");
    expect(migration).not.toMatch(/insert into public\.(invoices|payments)/);
    expect(claimAction).toContain("inviteRestaurantUser(");
    expect(demoBanner).toContain('href="/try/claim"');
  });

  it("activates exactly once from a non-demo-origin Accepted order", () => {
    expect(migration).toContain("add column if not exists activated_at timestamptz");
    expect(migration).toContain("add column if not exists activation_order_id uuid");
    expect(migration).toContain("add column if not exists is_demo boolean not null default false");
    expect(migration).toContain("target_status = 'Accepted'");
    expect(migration).toContain("orders.is_demo = false");
    expect(migration).toContain("restaurants.activated_at is null");
    expect(migration).toContain("task_key = 'test_order'");
    expect(dashboard).toContain("OnboardingProgressCard");
  });
});
