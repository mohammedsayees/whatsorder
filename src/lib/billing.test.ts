import { describe, expect, it } from "vitest";
import {
  addDays,
  computeInvoiceTotals,
  computeLineTotal,
  deriveAccessLevel,
  firstOfMonth,
  firstOfNextMonth,
  invoiceIdempotencyKey,
  isInvoiceSettled,
  lastOfMonth,
  resolvePlanFeatures
} from "@/lib/billing";

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

  it("builds a stable idempotency key", () => {
    expect(invoiceIdempotencyKey("sub-1", "2026-02-01")).toBe("sub-1:2026-02-01");
  });
});
