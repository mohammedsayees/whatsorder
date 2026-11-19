import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261121090000_assign_unassigned_shift_orders.sql"),
  "utf8"
);
const actions = readFileSync(resolve(process.cwd(), "src/app/admin/shifts/actions.ts"), "utf8");

describe("assign unassigned shift orders migration", () => {
  it("only lets the shift opener or management assign, under the shift lock", () => {
    expect(sql).toContain("for update;");
    expect(sql).toContain("shift_row.status <> 'open'");
    expect(sql).toMatch(
      /actor_role = 'staff' and shift_row\.opened_by_user_id <> event_actor_user_id/
    );
  });

  it("only assigns completed, unassigned, in-window orders of this tenant, all or nothing", () => {
    expect(sql).toContain("status = 'Completed'");
    expect(sql).toContain("shift_id is null");
    expect(sql).toContain("coalesce(closed_at, created_at) >= window_start");
    expect(sql).toContain("<> cardinality(requested_ids)");
    expect(sql).toMatch(/where restaurant_id = target_restaurant_id and id = any\(requested_ids\)/);
  });

  it("records an audit row per order and stays service-role only", () => {
    expect(sql).toContain("insert into public.shift_order_assignments");
    expect(sql).toContain("alter table public.shift_order_assignments enable row level security");
    expect(sql).toMatch(
      /revoke all on function public\.assign_unassigned_orders_to_open_shift\(uuid, uuid, uuid\[\], uuid\)\s+from public, anon, authenticated;/
    );
    expect(sql).not.toMatch(/for (insert|update|delete|all)\s/i);
  });

  it("is used instead of a direct orders update", () => {
    expect(actions).toContain('"assign_unassigned_orders_to_open_shift"');
    expect(actions).not.toMatch(/from\("orders"\)\s*\.update\(\{ shift_id/);
  });
});
