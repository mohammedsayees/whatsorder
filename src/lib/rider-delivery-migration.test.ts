import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261215090000_rider_delivery_cash_ledger.sql"),
  "utf8"
).toLowerCase();

describe("rider delivery + cash ledger migration", () => {
  it("keeps the ledger tenant-scoped, append-only and service-role-written", () => {
    expect(migration).toContain("foreign key (rider_id, restaurant_id)");
    expect(migration).toContain("references public.delivery_riders(id, restaurant_id)");
    expect(migration).toContain("foreign key (order_id, restaurant_id)");
    expect(migration).toContain("public.is_restaurant_member(restaurant_id)");
    expect(migration).toContain("revoke all on table public.rider_cash_entries");
    expect(migration).toContain("grant select, insert on table public.rider_cash_entries to service_role");
    expect(migration).not.toMatch(/for\s+(insert|update|delete|all)\s+to\s+authenticated/);
    expect(migration).not.toMatch(/grant[^;]*(update|delete)[^;]*rider_cash_entries/);
  });

  it("credits a delivery's cash at most once", () => {
    expect(migration).toContain("rider_cash_entries_one_order_cash");
    expect(migration).toMatch(/on public\.rider_cash_entries\(assignment_id\)\s+where entry_type = 'order_cash'/);
  });

  it("only lets the service role run the rider action", () => {
    expect(migration).toMatch(
      /revoke all on function public\.rider_delivery_action\(uuid, uuid, text, numeric, text, text\)\s+from public, anon, authenticated;/
    );
    expect(migration).toMatch(
      /grant execute on function public\.rider_delivery_action\(uuid, uuid, text, numeric, text, text\)\s+to service_role;/
    );
  });

  it("completes through the normal status transition as a rider actor", () => {
    expect(migration).toContain("public.transition_order_status_and_record_event");
    expect(migration).toMatch(/null, 'rider', null/);
  });

  it("refuses a stale or replaced assignment and rejects short cash", () => {
    expect(migration).toContain("latest_assignment_id is distinct from assignment_row.id");
    expect(migration).toContain("cash received is less than the amount due");
  });

  it("blocks shift close while a rider holds cash, then defers to v4", () => {
    expect(migration).toContain("create or replace function public.close_restaurant_shift_v5");
    expect(migration).toContain("settle rider cash before closing the shift");
    expect(migration).toContain("having sum(amount) <> 0");
    expect(migration).toContain("return public.close_restaurant_shift_v4(");
  });

  it("self-verifies privileges", () => {
    expect(migration).toContain("rider_cash_entries must be append-only and service-role-written");
    expect(migration).toContain("rider_delivery_action must remain service-role only");
  });
});
