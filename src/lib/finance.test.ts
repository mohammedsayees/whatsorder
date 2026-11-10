import { describe, expect, it } from "vitest";
import {
  monthlyAllocationSchedule,
  parseAedToFils,
  resolveFinanceAccess,
  splitInclusiveVat
} from "./finance";

describe("finance money", () => {
  it("parses AED strings into exact integer fils", () => {
    expect(parseAedToFils("345")).toBe(34_500);
    expect(parseAedToFils("345.7")).toBe(34_570);
    expect(parseAedToFils("345.70")).toBe(34_570);
    expect(parseAedToFils("0.01")).toBe(1);
  });

  it("rejects ambiguous, negative, zero, or over-precise money", () => {
    expect(parseAedToFils("1.001")).toBeNull();
    expect(parseAedToFils("1,000")).toBeNull();
    expect(parseAedToFils("-1")).toBeNull();
    expect(parseAedToFils("0")).toBeNull();
    expect(parseAedToFils("AED 12")).toBeNull();
  });

  it("splits VAT-inclusive totals while conserving every fil", () => {
    expect(splitInclusiveVat(1_800)).toEqual({
      subtotalFils: 1_714,
      vatFils: 86,
      totalFils: 1_800
    });
    const result = splitInclusiveVat(1_799);
    expect(result.subtotalFils + result.vatFils).toBe(result.totalFils);
  });
});

describe("recurring cost allocation", () => {
  it("allocates AED 12,000 exactly across twelve months", () => {
    expect(monthlyAllocationSchedule(1_200_000, 12)).toEqual(
      Array.from({ length: 12 }, () => 100_000)
    );
  });

  it("distributes remainder fils without losing value", () => {
    const schedule = monthlyAllocationSchedule(100, 3);
    expect(schedule).toEqual([34, 33, 33]);
    expect(schedule.reduce((sum, value) => sum + value, 0)).toBe(100);
  });
});

describe("finance permissions", () => {
  const manager = {
    role: "manager" as const,
    can_view: true,
    can_create: true,
    can_approve: false,
    can_manage_categories: false,
    can_manage_recurring: false
  };

  it("gives owner/admin full access only when the tenant flag is enabled", () => {
    expect(resolveFinanceAccess(true, "owner").manage_permissions).toBe(true);
    expect(resolveFinanceAccess(false, "owner").view).toBe(false);
  });

  it("uses configured manager access and never delegates permission management", () => {
    expect(resolveFinanceAccess(true, "manager", manager)).toMatchObject({
      view: true,
      create: true,
      approve: false,
      manage_permissions: false
    });
  });

  it("keeps staff denied without an explicit row", () => {
    expect(resolveFinanceAccess(true, "staff").view).toBe(false);
  });

  it("does not allow blind approval or management without view access", () => {
    expect(resolveFinanceAccess(true, "manager", {
      ...manager,
      can_view: false,
      can_approve: true,
      can_manage_categories: true,
      can_manage_recurring: true
    })).toMatchObject({
      approve: false,
      manage_categories: false,
      manage_recurring: false
    });
  });
});
