import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261110120000_yearly_billing_contracts.sql"
  ),
  "utf8"
);

describe("yearly billing contracts migration", () => {
  it("adds annual plan pricing and preserves existing subscriptions as monthly", () => {
    expect(migration).toContain("annual_price numeric(10, 2)");
    expect(migration).toContain("set annual_price = monthly_price * 12");
    expect(migration).toContain(
      "billing_interval text not null default 'monthly'"
    );
  });

  it("constrains billing intervals without changing billing RLS", () => {
    expect(migration).toContain("billing_interval in ('monthly', 'yearly')");
    expect(migration).not.toContain("disable row level security");
    expect(migration).not.toContain("create policy");
  });
});
