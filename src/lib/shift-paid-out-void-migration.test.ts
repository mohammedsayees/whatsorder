import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");
const voids = read("20261119120000_shift_cash_paid_out_voids.sql");
const previous = read("20261112180000_shift_report_live_recalculation.sql");

function summaryFunction(sql: string) {
  const start = sql.indexOf("create or replace function public.calculate_restaurant_shift_summary");
  const end = sql.indexOf("$shift_summary$;", start);
  return sql.slice(start, end).split("\n");
}

describe("shift cash paid-out void migration", () => {
  it("changes the shift summary by exactly one filter line", () => {
    const before = summaryFunction(previous);
    const after = summaryFunction(voids);
    const remaining = [...after];
    for (const line of before) {
      const index = remaining.indexOf(line);
      expect(index, `line removed or changed: ${line}`).toBeGreaterThanOrEqual(0);
      remaining.splice(index, 1);
    }
    expect(remaining.map((line) => line.trim())).toEqual(["and voided_at is null"]);
    // The new filter sits in the paid_outs CTE, not in other_income.
    const paidOuts = after.slice(after.findIndex((line) => line.includes("paid_outs as (")));
    expect(paidOuts.slice(0, 6).map((line) => line.trim())).toContain("and voided_at is null");
  });

  it("keeps voided rows for audit with a required reason", () => {
    const sql = voids.toLowerCase();
    expect(sql).toContain("add column voided_at timestamptz");
    expect(sql).toContain("shift_cash_paid_outs_void_check");
    expect(sql).not.toMatch(/delete\s+from\s+public\.shift_cash_paid_outs/);
  });

  it("restricts voids by shift state and role", () => {
    const sql = voids.toLowerCase();
    expect(sql).toContain("only the shift opener or restaurant management can void a paid-out");
    expect(sql).toContain("only restaurant management can void a paid-out after shift close");
    // Closed shifts go through the audited report refresh, which refuses closed business days.
    expect(sql).toMatch(/public\.refresh_closed_shift_report\([\s\S]*?event_actor_user_id, false\s*\)/);
    expect(sql).toContain("this shift has no close report to update");
  });

  it("is service-role only and releases finance links", () => {
    const sql = voids.toLowerCase();
    expect(sql).toContain("revoke all on function public.void_shift_cash_paid_out(uuid, uuid, text, uuid)");
    expect(sql).toContain("grant execute on function public.void_shift_cash_paid_out(uuid, uuid, text, uuid) to service_role");
    expect(sql).toContain("update public.finance_paid_out_links set");
    expect(sql).toContain("paid_out.voided_at is null");
  });
});
