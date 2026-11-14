import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  NO_SUBSCRIPTION_ACCESS,
  aiImageOverrideChoice,
  buildFeatureOverrides,
  featureOverrideChoice,
  sameFeatureOverrides,
  aiImageAllowanceRemaining,
  isPlanFeatureFlag,
  resolveEntitlements,
  tenantHasFeature
} from "@/lib/billing";
import { uaeMonthStartIso } from "@/lib/ai/image-allowance";

const STARTER_FEATURES = {
  campaigns: false,
  advanced_analytics: false,
  scheduled_orders: false,
  multi_branch: false,
  chat_inbox: false,
  finance: false
};

describe("resolveEntitlements", () => {
  it("uses plan flags and the plan's monthly AI image limit for active tenants", () => {
    const result = resolveEntitlements({
      planFeatures: STARTER_FEATURES,
      planMonthlyAiImageLimit: 10,
      overrides: {},
      status: "active"
    });
    expect(result.features.chat_inbox).toBe(false);
    expect(result.features.finance).toBe(false);
    expect(result.features.campaigns).toBe(false);
    expect(result.monthlyAiImages).toBe(10);
  });

  it("gives trialing tenants the Growth feature set and allowance", () => {
    const result = resolveEntitlements({
      planFeatures: STARTER_FEATURES,
      planMonthlyAiImageLimit: 10,
      overrides: null,
      status: "trialing"
    });
    expect(result.features.campaigns).toBe(true);
    expect(result.features.chat_inbox).toBe(true);
    expect(result.features.finance).toBe(true);
    expect(result.features.multi_branch).toBe(false);
    expect(result.monthlyAiImages).toBe(100);
  });

  it("lets per-contract overrides grant or revoke flags and lift the AI cap", () => {
    const granted = resolveEntitlements({
      planFeatures: STARTER_FEATURES,
      planMonthlyAiImageLimit: 10,
      overrides: { chat_inbox: true, finance: true, monthly_ai_image_limit: null },
      status: "active"
    });
    expect(granted.features.chat_inbox).toBe(true);
    expect(granted.features.finance).toBe(true);
    expect(granted.monthlyAiImages).toBeNull();

    const revoked = resolveEntitlements({
      planFeatures: { ...STARTER_FEATURES, campaigns: true },
      planMonthlyAiImageLimit: null,
      overrides: { campaigns: false, monthly_ai_image_limit: 25 },
      status: "trialing"
    });
    expect(revoked.features.campaigns).toBe(false);
    expect(revoked.monthlyAiImages).toBe(25);
  });

  it("ignores malformed overrides and limits", () => {
    const result = resolveEntitlements({
      planFeatures: STARTER_FEATURES,
      planMonthlyAiImageLimit: -5,
      overrides: { chat_inbox: "yes", monthly_ai_image_limit: "lots" },
      status: "active"
    });
    expect(result.features.chat_inbox).toBe(false);
    expect(result.monthlyAiImages).toBeNull();
  });
});

describe("tenantHasFeature", () => {
  it("never gates a tenant without a plan on record", () => {
    expect(tenantHasFeature(NO_SUBSCRIPTION_ACCESS, "finance")).toBe(true);
  });

  it("gates a planned tenant by its resolved flags", () => {
    const access = {
      plan_code: "starter",
      plan_features: { ...NO_SUBSCRIPTION_ACCESS.plan_features, campaigns: true }
    };
    expect(tenantHasFeature(access, "campaigns")).toBe(true);
    expect(tenantHasFeature(access, "chat_inbox")).toBe(false);
  });

  it("recognises only known flags", () => {
    expect(isPlanFeatureFlag("finance")).toBe(true);
    expect(isPlanFeatureFlag("toString")).toBe(false);
  });
});

describe("AI image allowance", () => {
  it("allows when uncapped and fails closed when usage is unknown", () => {
    expect(aiImageAllowanceRemaining(null, null)).toBe(true);
    expect(aiImageAllowanceRemaining(10, 9)).toBe(true);
    expect(aiImageAllowanceRemaining(10, 10)).toBe(false);
    expect(aiImageAllowanceRemaining(10, null)).toBe(false);
  });

  it("counts from the start of the UAE calendar month", () => {
    // 2026-11-30 21:30 UTC is already 1 December in Dubai.
    expect(uaeMonthStartIso(Date.parse("2026-11-30T21:30:00Z"))).toBe("2026-11-30T20:00:00.000Z");
    expect(uaeMonthStartIso(Date.parse("2026-11-14T10:00:00Z"))).toBe("2026-10-31T20:00:00.000Z");
  });
});

describe("pricing v2 migration", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261117120000_pricing_tiers_v2.sql"),
    "utf8"
  );

  it("sets the new prices with two months free on annual billing", () => {
    expect(migration).toMatch(/monthly_price = 149\.00,\s+annual_price = 1490\.00/);
    expect(migration).toMatch(/name = 'Growth'[\s\S]*monthly_price = 299\.00,\s+annual_price = 2990\.00/);
    expect(migration).toMatch(/name = 'Personalised'[\s\S]*monthly_price = 599\.00,\s+annual_price = 5990\.00/);
  });

  it("grandfathers existing subscriptions' price and features before repricing", () => {
    const pinIndex = migration.indexOf("Grandfathered: pre-November 2026 pricing");
    const repriceIndex = migration.indexOf("monthly_price = 149.00");
    expect(pinIndex).toBeGreaterThan(-1);
    expect(pinIndex).toBeLessThan(repriceIndex);
    expect(migration).toContain("insert into public.subscription_price_events");
    expect(migration).toContain("'chat_inbox', true");
    expect(migration).toContain("a live subscription was left without a pinned price");
  });

  it("keeps existing RLS and makes the new audit table read-only", () => {
    expect(migration).not.toMatch(/disable row level security/i);
    expect(migration).toContain(
      "alter table public.subscription_feature_events enable row level security;"
    );
    const policies = migration.match(/create policy[\s\S]*?;/gi) ?? [];
    expect(policies).toHaveLength(2);
    for (const policy of policies) {
      expect(policy).toContain("on public.subscription_feature_events for select");
    }
    expect(migration).not.toMatch(/grant (insert|update|delete|all)/i);
    expect(migration).toContain("grant select on table public.subscription_feature_events to authenticated;");
  });

  it("logs grandfathered features once and lets Personalised be assigned", () => {
    expect(migration).toContain("'Grandfathered: all features kept from pre-November 2026 pricing'");
    expect(migration).toContain("and subscription.feature_overrides = '{}'::jsonb");
    expect(migration).toContain("'pro', 'multi_branch', 'custom'");
  });
});

describe("feature override panel helpers", () => {
  it("reads current choices from stored overrides", () => {
    const stored = { chat_inbox: true, finance: false, monthly_ai_image_limit: 500 };
    expect(featureOverrideChoice(stored, "chat_inbox")).toBe("on");
    expect(featureOverrideChoice(stored, "finance")).toBe("off");
    expect(featureOverrideChoice(stored, "campaigns")).toBe("plan");
    expect(aiImageOverrideChoice(stored)).toEqual({ choice: "custom", limit: 500 });
    expect(aiImageOverrideChoice({ monthly_ai_image_limit: null })).toEqual({ choice: "unlimited", limit: null });
    expect(aiImageOverrideChoice({})).toEqual({ choice: "plan", limit: null });
  });

  it("builds overrides, drops 'follow plan' keys and keeps unmanaged keys", () => {
    const result = buildFeatureOverrides(
      { campaigns: true, multi_branch: true, monthly_ai_image_limit: null },
      { features: { campaigns: "plan", finance: "on", chat_inbox: "off" }, aiImages: "custom", aiImageLimit: 500 }
    );
    expect(result).toEqual({
      ok: true,
      overrides: { multi_branch: true, finance: true, chat_inbox: false, monthly_ai_image_limit: 500 }
    });

    const reset = buildFeatureOverrides(
      { campaigns: true, monthly_ai_image_limit: 50 },
      { features: {}, aiImages: "plan", aiImageLimit: null }
    );
    expect(reset).toEqual({ ok: true, overrides: {} });

    const unlimited = buildFeatureOverrides({}, { features: {}, aiImages: "unlimited", aiImageLimit: 3 });
    expect(unlimited).toEqual({ ok: true, overrides: { monthly_ai_image_limit: null } });
  });

  it("rejects an invalid custom AI image amount", () => {
    for (const limit of [null, -1, 2.5, 10001, Number.NaN]) {
      expect(buildFeatureOverrides({}, { features: {}, aiImages: "custom", aiImageLimit: limit }).ok).toBe(false);
    }
  });

  it("compares overrides regardless of key order", () => {
    expect(sameFeatureOverrides({ a: true, b: false }, { b: false, a: true })).toBe(true);
    expect(sameFeatureOverrides({ a: true }, { a: false })).toBe(false);
    expect(sameFeatureOverrides(null, {})).toBe(true);
  });
});
