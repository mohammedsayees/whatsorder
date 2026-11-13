import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("onboarding funnel event contracts", () => {
  const migration = source(
    "supabase/migrations/20261114100000_onboarding_funnel_events.sql"
  );
  const helper = source("src/lib/onboarding-events.ts");
  const instrumentedSources = [
    source("src/app/try/actions.ts"),
    source("src/app/try/claim/page.tsx"),
    source("src/app/try/claim/actions.ts"),
    source("src/app/admin/page.tsx"),
    source("src/app/admin/orders/status-actions.ts"),
    source("src/app/admin/share/actions.ts")
  ].join("\n");

  it("stores one PII-free occurrence per restaurant and milestone", () => {
    expect(migration).toContain("unique (restaurant_id, event_name)");
    expect(migration).toContain("metadata jsonb not null default '{}'::jsonb");
    expect(helper).toContain('metadata: {}');
    expect(helper).not.toMatch(/email|phone|customer/i);
  });

  it("keeps writes service-role-only and reads tenant-scoped", () => {
    expect(migration).toContain(
      "revoke all on table public.onboarding_funnel_events from public, anon, authenticated"
    );
    expect(migration).toContain(
      "grant all on table public.onboarding_funnel_events to service_role"
    );
    expect(migration).toContain("public.is_restaurant_member(restaurant_id)");
    expect(migration).toContain("public.is_super_admin()");
  });

  it("instruments every milestone in the owner activation journey", () => {
    for (const eventName of [
      "demo_built",
      "menu_reviewed",
      "claim_viewed",
      "restaurant_claimed",
      "dashboard_opened",
      "test_order_accepted",
      "qr_opened"
    ]) {
      expect(instrumentedSources).toContain(`"${eventName}"`);
    }
    expect(source("src/app/admin/onboarding/actions.ts")).toContain(
      '"test_order_started"'
    );
  });
});
