import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const costing = readFileSync(resolve(process.cwd(), "supabase/migrations/20261111160000_smart_finance_cost_engine.sql"), "utf8").toLowerCase();
const reporting = readFileSync(resolve(process.cwd(), "supabase/migrations/20261111180000_smart_finance_reporting.sql"), "utf8").toLowerCase();
const pilot = readFileSync(resolve(process.cwd(), "supabase/migrations/20261111200000_smart_finance_chai_xpress_pilot.sql"), "utf8").toLowerCase();

describe("smart finance cost and reporting migrations", () => {
  it("keeps cost writes service-role-only", () => {
    expect(costing).not.toMatch(/for\s+(insert|update|delete|all)\s+to\s+authenticated/);
    expect(costing).toContain("finance cost write policy detected");
    expect(costing).toContain("grant execute on function public.confirm_finance_purchase_price");
  });

  it("uses tenant-consistent cost relationships and immutable snapshots", () => {
    expect(costing).toContain("foreign key (order_id, restaurant_id)");
    expect(costing).toContain("foreign key (ingredient_id, restaurant_id)");
    expect(costing).toContain("finance_product_cost_snapshots_order_line_unique");
    expect(costing).toContain("missing_option_recipe");
  });

  it("does not expose report telemetry writes or backfill to browser roles", () => {
    expect(reporting).not.toMatch(/for\s+(insert|update|delete|all)\s+to\s+authenticated/);
    expect(reporting).toContain("revoke all on function public.backfill_finance_cost_snapshots");
    expect(reporting).toContain("to service_role");
  });

  it("keeps pilot release service-only and explicitly readiness-gated", () => {
    expect(pilot).not.toMatch(/for\s+(insert|update|delete|all)\s+to\s+authenticated/);
    expect(pilot).toContain("pilot must be reconciled before release");
    expect(pilot).toContain("sample.complete_count * 100 >= sample.snapshot_count * 80");
    expect(pilot).toContain("grant execute on function public.get_finance_pilot_readiness");
    expect(pilot).toContain("to service_role");
  });
});
