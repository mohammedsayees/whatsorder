import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260721120000_jobs_phase1.sql"), "utf8");
const actions = readFileSync(resolve(process.cwd(), "src/app/admin/jobs/actions.ts"), "utf8");

describe("jobs database boundary", () => {
  it("keeps browser roles read-only and public users off private tables", () => {
    expect(migration).toContain("alter table public.jobs enable row level security");
    expect(migration).toContain("revoke all on table public.jobs, public.job_reports, public.job_events");
    expect(migration).toContain("grant select on table public.jobs, public.job_reports, public.job_events\nto authenticated");
    expect(migration).not.toMatch(/grant (insert|update|delete|all).*public\.jobs.*authenticated/i);
  });

  it("limits tenant reads to management roles and super admins", () => {
    expect(migration).toContain("array['restaurant_admin', 'owner', 'manager']");
    expect(migration).toContain("or public.is_super_admin()");
    expect(migration).toContain('create policy "Read job reports (super admins)"');
    expect(migration).toContain('create policy "Read job events (super admins)"');
  });

  it("publishes only active, unexpired jobs through a safe projection", () => {
    const publicColumns = migration.split("returns table (")[1]?.split(")\nlanguage sql")[0] ?? "";
    expect(migration).toContain("where job.status = 'published'");
    expect(migration).toContain("and job.expires_at > now()");
    expect(publicColumns).not.toContain("restaurant_id");
    expect(publicColumns).not.toContain("created_by");
  });

  it("locks reporting and event RPCs to service role", () => {
    expect(migration).toMatch(/grant execute on function public\.report_public_job\([\s\S]*?\)\nto service_role/);
    expect(migration).toMatch(/grant execute on function public\.record_public_job_event\([\s\S]*?\)\nto service_role/);
    expect(migration).toContain("created_at > now() - interval '5 minutes'");
    expect(migration).toContain("set whatsapp_apply_clicks = whatsapp_apply_clicks + 1");
  });

  it("derives every mutated tenant from the verified session", () => {
    expect(actions).toContain("restaurant_id: session.restaurantId");
    expect(actions).toContain('.eq("restaurant_id", session.restaurantId)');
    expect(actions).not.toContain('formData.get("restaurant_id")');
    expect(actions).toContain('requireRestaurantRole(["restaurant_admin", "owner"])');
  });
});
