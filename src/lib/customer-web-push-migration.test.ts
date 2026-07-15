import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260715210000_customer_web_push.sql",
    import.meta.url
  ),
  "utf8"
).toLowerCase();

describe("customer Web Push migration", () => {
  it("keeps subscription writes service-role only", () => {
    expect(migration).toContain(
      "alter table public.customer_push_subscriptions enable row level security"
    );
    expect(migration).toContain(
      "revoke all on table public.customer_push_subscriptions from anon, authenticated"
    );
    expect(migration).toContain(
      "customer_push_subscriptions must have no rls policies"
    );
    expect(migration).not.toContain("create policy");
  });

  it("binds every subscription to an order from the same tenant", () => {
    expect(migration).toContain(
      "foreign key (order_id, restaurant_id)"
    );
    expect(migration).toContain(
      "references public.orders(id, restaurant_id)"
    );
  });

  it("keeps marketing disabled without separate consent", () => {
    expect(migration).toContain(
      "marketing_enabled boolean not null default false"
    );
    expect(migration).toContain(
      "marketing_enabled = true and marketing_consent_at is not null"
    );
  });
});
