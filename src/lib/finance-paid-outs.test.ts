import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  comparePaidOutToExpense,
  formatDifference,
  paidOutAmountToFils,
  rankLinkCandidates
} from "@/lib/finance-paid-outs";

describe("paidOutAmountToFils", () => {
  it("converts 2-decimal amounts without float drift", () => {
    expect(paidOutAmountToFils(12.3)).toBe(1230);
    expect(paidOutAmountToFils("45.67")).toBe(4567);
    expect(paidOutAmountToFils(0.1 + 0.2)).toBe(30);
  });

  it("rejects empty, zero and negative amounts", () => {
    expect(paidOutAmountToFils(0)).toBeNull();
    expect(paidOutAmountToFils(-5)).toBeNull();
    expect(paidOutAmountToFils("abc")).toBeNull();
  });
});

describe("comparePaidOutToExpense", () => {
  it("treats an exact match as paid without confirmation", () => {
    expect(comparePaidOutToExpense(5000, 5000)).toEqual({
      differenceFils: 0, paymentStatus: "paid", needsConfirmation: false
    });
  });

  it("marks a short paid-out as partial and requires confirmation", () => {
    expect(comparePaidOutToExpense(4000, 5000)).toEqual({
      differenceFils: -1000, paymentStatus: "partial", needsConfirmation: true
    });
  });

  it("keeps an over-paid bill as paid but requires confirmation", () => {
    expect(comparePaidOutToExpense(5250, 5000)).toEqual({
      differenceFils: 250, paymentStatus: "paid", needsConfirmation: true
    });
  });

  it("rejects invalid amounts", () => {
    expect(() => comparePaidOutToExpense(0, 100)).toThrow();
    expect(() => comparePaidOutToExpense(100, 1.5)).toThrow();
  });
});

describe("rankLinkCandidates", () => {
  const candidates = [
    { id: "far-date", total_fils: 5000, incurred_on: "2026-10-01" },
    { id: "close-amount", total_fils: 5100, incurred_on: "2026-11-10" },
    { id: "exact", total_fils: 5000, incurred_on: "2026-11-09" },
    { id: "way-off", total_fils: 90000, incurred_on: "2026-11-10" }
  ];

  it("orders by amount gap first, then by date distance", () => {
    expect(rankLinkCandidates(candidates, 5000, "2026-11-10").map((row) => row.id))
      .toEqual(["exact", "far-date", "close-amount", "way-off"]);
  });

  it("respects the limit", () => {
    expect(rankLinkCandidates(candidates, 5000, "2026-11-10", 2)).toHaveLength(2);
  });
});

describe("formatDifference", () => {
  const format = (fils: number) => `AED ${(fils / 100).toFixed(2)}`;
  it("describes the direction of the difference", () => {
    expect(formatDifference(0, format)).toBe("Exact match");
    expect(formatDifference(250, format)).toBe("Till paid AED 2.50 more than the bill");
    expect(formatDifference(-1000, format)).toBe("Till paid AED 10.00 less than the bill");
  });
});

describe("paid-out link migration", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261119090000_finance_shift_paid_out_links.sql"),
    "utf8"
  ).toLowerCase();

  it("keeps writes service-role-only and self-verifies", () => {
    expect(sql).not.toMatch(/for\s+(insert|update|delete|all)\s+to\s+authenticated/);
    expect(sql).toContain("finance paid-out link write policy detected");
    expect(sql).toContain("using (public.has_finance_permission(restaurant_id, 'view'))");
    expect(sql).toMatch(/grant execute on function[\s\S]*to service_role;/);
  });

  it("enforces one paid-out = one bill with tenant-consistent keys", () => {
    expect(sql).toContain("on public.finance_paid_out_links(paid_out_id) where removed_at is null");
    expect(sql).toContain("where removed_at is null and expense_id is not null");
    expect(sql).toContain("references public.shift_cash_paid_outs(id, restaurant_id)");
    expect(sql).toContain("references public.finance_expenses(id, restaurant_id)");
  });

  it("requires a reason whenever the amounts differ", () => {
    expect(sql).toContain("difference_fils = paid_out_amount_fils - expense_total_fils");
    expect(sql).toContain("(difference_fils = 0 or mismatch_reason is not null)");
    expect(sql).toContain("amounts differ: confirm the mismatch and give a reason");
  });

  it("never redefines shift cash math", () => {
    expect(sql).not.toContain("calculate_restaurant_shift_summary");
    expect(sql).not.toContain("close_restaurant_shift");
    expect(sql).not.toContain("add_shift_cash_paid_out");
    expect(sql).not.toContain("refresh_closed_shift_report");
    expect(sql).not.toMatch(/update\s+public\.shift_cash_paid_outs/);
    expect(sql).not.toMatch(/update\s+public\.restaurant_shifts/);
  });

  it("is gated on finance being enabled and AED", () => {
    expect(sql).toContain("finance is not enabled for this restaurant");
    expect(sql).toContain("currency_code <> 'aed'");
  });
});
