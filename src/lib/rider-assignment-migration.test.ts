import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261110070000_delivery_rider_assignments.sql"
  ),
  "utf8"
).toLowerCase();

describe("delivery rider assignment migration", () => {
  it("uses tenant-consistent rider and order foreign keys", () => {
    expect(migration).toContain("foreign key (order_id, restaurant_id)");
    expect(migration).toContain("references public.orders(id, restaurant_id)");
    expect(migration).toContain("foreign key (rider_id, restaurant_id)");
    expect(migration).toContain(
      "references public.delivery_riders(id, restaurant_id)"
    );
  });

  it("keeps writes service-role-only and reads tenant-scoped", () => {
    expect(migration).not.toMatch(
      /for\s+(insert|update|delete|all)\s+to\s+authenticated/
    );
    expect(migration).toContain(
      "grant all on public.delivery_riders, public.order_rider_assignments"
    );
    expect(migration).toContain("public.is_restaurant_member(restaurant_id)");
  });

  it("does not persist a duplicate copy of the customer delivery message", () => {
    expect(migration).not.toContain("message_text");
  });
});
