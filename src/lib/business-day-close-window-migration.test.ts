import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");
const next = read("20261121180000_business_day_close_unassigned_window.sql");
const previous = read("20261112180000_shift_report_live_recalculation.sql");

function closeBusinessDay(sql: string) {
  const start = sql.indexOf("create or replace function public.close_business_day(");
  const end = sql.indexOf("$close_business_day$;", start);
  return sql.slice(start, end).split("\n");
}

describe("business day close: unassigned-order window", () => {
  it("changes close_business_day only in the unassigned-order condition", () => {
    const before = closeBusinessDay(previous);
    const after = closeBusinessDay(next);
    const removed = before.filter((line) => !after.includes(line)).map((line) => line.trim());
    const added = after.filter((line) => !before.includes(line)).map((line) => line.trim());

    expect(removed).toEqual(["and shift_id is null and created_at >= target_day.opened_at"]);
    expect(added).toEqual([
      "and shift_id is null",
      "and coalesce(closed_at, created_at) >= public.unassigned_shift_order_window_start(target_restaurant_id)"
    ]);
  });

  it("stays service-role only", () => {
    expect(next).toContain(
      "revoke all on function public.close_business_day(uuid, uuid, uuid)\nfrom public, anon, authenticated;"
    );
    expect(next).toContain(
      "grant execute on function public.close_business_day(uuid, uuid, uuid) to service_role;"
    );
  });
});
