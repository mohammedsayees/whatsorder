import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("self-serve claim store link contracts", () => {
  const migration = source("supabase/migrations/20261112120000_self_serve_claim_store_link.sql");
  const claimAction = source("src/app/try/claim/actions.ts");
  const claimForm = source("src/components/try/ClaimDemoForm.tsx");
  const claimLookup = source("src/app/try/claim/claimable-demo.ts");
  const demoAction = source("src/app/try/actions.ts");
  const slugAction = source("src/app/admin/settings/actions.ts");

  it("replaces the claim function with a slug-aware, service-role-only version", () => {
    expect(migration).toContain(
      "drop function if exists public.claim_demo_restaurant(\n  uuid, text, text, text, text, text, text, text, text\n);"
    );
    expect(migration).toContain("security definer");
    expect(migration).toMatch(
      /revoke all on function public\.claim_demo_restaurant\(\s*uuid, text, text, text, text, text, text, text, text, text\s*\) from public, anon, authenticated;/
    );
    expect(migration).toMatch(
      /grant execute on function public\.claim_demo_restaurant\(\s*uuid, text, text, text, text, text, text, text, text, text\s*\) to service_role;/
    );
    expect(claimAction).toContain("submitted_slug: values.slug");
  });

  it("keeps the one-time hashed proof and owner uniqueness checks", () => {
    expect(migration).toContain("claims.claim_token_hash = submitted_claim_token_hash");
    expect(migration).toContain("claim_token_hash = null");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("This email is already assigned to another restaurant");
    expect(migration).toContain("claimed_at_value + interval '14 days'");
  });

  it("sets a validated, unique, non-demo store link at claim", () => {
    expect(migration).toContain("slug = normalized_slug");
    expect(migration).toContain("'^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'");
    expect(migration).toContain("normalized_slug like 'demo-%'");
    expect(migration).toContain("This store link is already taken");
  });

  it("completes the restaurant_live task at claim and backfills claimed stores", () => {
    expect(migration).toContain(
      "(claimed_restaurant_id, 'restaurant_live', 'Restaurant live', true, claimed_at_value)"
    );
    expect(migration).toMatch(/update public\.onboarding_tasks[\s\S]*task_key = 'restaurant_live'/);
  });

  it("verifies the claim token before reading demo details", () => {
    expect(claimLookup).toContain('import "server-only"');
    expect(claimLookup).toContain('.eq("claim_token_hash", hashDemoClaimToken(claim.token))');
    expect(claimLookup).toContain('.eq("is_demo", true)');
  });

  it("reads demo prices in the chosen country's currency", () => {
    expect(demoAction).toContain("country.currencyCode");
    expect(demoAction).not.toContain('page.mimeType, "AED"');
    expect(demoAction).toContain("...countryProfileFields(countryCode)");
  });

  it("validates go-live settings before claiming and saves them to the claimed tenant only", () => {
    const parseAt = claimAction.indexOf("parseGoLiveSettings(formData)");
    const rpcAt = claimAction.indexOf('admin.rpc("claim_demo_restaurant"');
    const saveAt = claimAction.search(/\.update\(\{\s*\.\.\.goLive\.settings/);
    expect(parseAt).toBeGreaterThan(-1);
    expect(parseAt).toBeLessThan(rpcAt);
    expect(saveAt).toBeGreaterThan(rpcAt);
    expect(claimAction).toContain('.eq("id", String(restaurantId))\n    .eq("is_demo", false)');
    expect(claimAction).toContain('markOnboardingTasksComplete(String(restaurantId), ["fulfilment_settings"])');
  });

  it("keeps claiming short with safe takeaway-only launch defaults", () => {
    expect(claimForm).toContain('name="pickup_enabled" type="hidden" value="on"');
    expect(claimForm).not.toContain('name="delivery_enabled"');
    expect(claimForm).toContain('name="hours_mode" type="hidden" value="always"');
    expect(claimForm).toContain('name="accepting_orders"');
    expect(claimAction).toContain('accepting_orders: values.accepting_orders === "on"');
  });

  it("limits store link changes to owners and admins of their own restaurant", () => {
    expect(slugAction).toContain('requireRestaurantRole(["owner", "restaurant_admin"])');
    expect(slugAction).toContain('.eq("id", restaurant.id)');
  });
});
