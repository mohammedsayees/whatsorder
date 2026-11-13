import { describe, expect, it } from "vitest";
import {
  addDays,
  annualCycleEnd,
  billingCycleFor,
  buildContractChangePatch,
  computeInvoiceTotals,
  computeLineTotal,
  deriveAccessLevel,
  firstOfMonth,
  firstOfNextMonth,
  invoiceIdempotencyKey,
  isInvoiceSettled,
  lastOfMonth,
  priceForBillingInterval,
  priceForSubscription,
  resolvePlanFeatures
} from "@/lib/billing";

describe("contract changes", () => {
  it("cannot reset lifecycle or billing-cycle state", () => {
    const patch = buildContractChangePatch({
      planId: "pro-plan",
      billingInterval: "yearly",
      priceOverride: 1990,
      priceOverrideReason: "Founding customer",
      priceOverrideEndsAt: "2027-12-31",
      actorUserId: "admin-1",
      changedAt: "2026-11-11T00:00:00.000Z"
    });

    expect(patch).toEqual({
      plan_id: "pro-plan",
      billing_interval: "yearly",
      price_override: 1990,
      price_override_reason: "Founding customer",
      price_override_ends_at: "2027-12-31",
      price_override_created_by: "admin-1",
      price_override_updated_at: "2026-11-11T00:00:00.000Z"
    });
    expect(patch).not.toHaveProperty("status");
    expect(patch).not.toHaveProperty("billing_cycle_start");
    expect(patch).not.toHaveProperty("billing_cycle_end");
    expect(patch).not.toHaveProperty("trial_ends_at");
    expect(patch).not.toHaveProperty("grace_until");
  });
});

describe("deriveAccessLevel", () => {
  it("keeps trialing and active tenants on full access", () => {
    expect(deriveAccessLevel("trialing")).toBe("full");
    expect(deriveAccessLevel("active")).toBe("full");
  });

  it("warns but does not block past_due tenants", () => {
    expect(deriveAccessLevel("past_due")).toBe("read_only_warning");
  });

  it("soft-blocks suspended and cancelled tenants", () => {
    expect(deriveAccessLevel("suspended")).toBe("soft_blocked");
    expect(deriveAccessLevel("cancelled")).toBe("soft_blocked");
  });

  it("never locks out a tenant with no subscription on record", () => {
    expect(deriveAccessLevel(null)).toBe("full");
  });
});

describe("resolvePlanFeatures", () => {
  it("fills missing flags with safe false defaults", () => {
    expect(resolvePlanFeatures({ campaigns: true })).toEqual({
      campaigns: true,
      advanced_analytics: false,
      scheduled_orders: false,
      multi_branch: false,
      group_reporting: false,
      shared_menu: false
    });
  });

  it("ignores non-boolean and unknown keys", () => {
    expect(resolvePlanFeatures({ campaigns: "yes", bogus: true }).campaigns).toBe(false);
  });

  it("returns all-false when features are null", () => {
    expect(resolvePlanFeatures(null).multi_branch).toBe(false);
  });
});

describe("invoice math", () => {
  it("computes a line total", () => {
    expect(computeLineTotal(3, 99)).toBe(297);
  });

  it("totals with zero VAT (Phase 1 default)", () => {
    const items = [{ line_total: 249 }];
    expect(computeInvoiceTotals(items, 0)).toEqual({
      subtotal: 249,
      vat_amount: 0,
      total: 249
    });
  });

  it("totals with 5% VAT once registered", () => {
    const items = [{ line_total: 100 }, { line_total: 100 }];
    expect(computeInvoiceTotals(items, 5)).toEqual({
      subtotal: 200,
      vat_amount: 10,
      total: 210
    });
  });

  it("settles only when payments reach the total", () => {
    expect(isInvoiceSettled(249, 100)).toBe(false);
    expect(isInvoiceSettled(249, 249)).toBe(true);
    expect(isInvoiceSettled(249, 300)).toBe(true);
  });
});

describe("calendar date helpers", () => {
  it("derives month boundaries", () => {
    expect(firstOfMonth("2026-02-17")).toBe("2026-02-01");
    expect(lastOfMonth("2026-02-17")).toBe("2026-02-28");
    expect(firstOfNextMonth("2026-12-10")).toBe("2027-01-01");
  });

  it("adds net terms days across a month boundary", () => {
    expect(addDays("2026-02-26", 7)).toBe("2026-03-05");
  });

  it("builds a twelve-month annual contract cycle", () => {
    expect(annualCycleEnd("2026-11-10")).toBe("2027-11-09");
    expect(billingCycleFor("yearly", "2026-11-10")).toEqual({
      start: "2026-11-10",
      end: "2027-11-09"
    });
  });

  it("handles leap-day annual contracts", () => {
    expect(annualCycleEnd("2024-02-29")).toBe("2025-02-28");
  });

  it("selects the price for the contract interval", () => {
    const plan = { monthly_price: 249, annual_price: 2490 };
    expect(priceForBillingInterval(plan, "monthly")).toBe(249);
    expect(priceForBillingInterval(plan, "yearly")).toBe(2490);
  });

  it("uses an active contract price and returns to list price after it ends", () => {
    const plan = { monthly_price: 249, annual_price: 2490 };
    const subscription = {
      billing_interval: "yearly" as const,
      price_override: 1990,
      price_override_ends_at: "2027-12-31"
    };

    expect(priceForSubscription(plan, subscription, "2027-12-31")).toBe(1990);
    expect(priceForSubscription(plan, subscription, "2028-01-01")).toBe(2490);
  });

  it("builds a stable idempotency key", () => {
    expect(invoiceIdempotencyKey("sub-1", "2026-02-01")).toBe("sub-1:2026-02-01");
  });
});

describe("billingDateString", () => {
  it("uses the Dubai calendar date, not UTC", async () => {
    const { billingDateString } = await import("./billing");
    // 21:30 UTC on the 12th is 01:30 on the 13th in Dubai.
    expect(billingDateString(new Date("2026-11-12T21:30:00Z"))).toBe("2026-11-13");
    expect(billingDateString(new Date("2026-11-12T19:59:59Z"))).toBe("2026-11-12");
    // The 03:00 UTC cron sees the same date either way.
    expect(billingDateString(new Date("2026-11-13T03:00:00Z"))).toBe("2026-11-13");
  });
});
