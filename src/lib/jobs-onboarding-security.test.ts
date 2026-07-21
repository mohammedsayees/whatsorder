import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const migration = source(
  "supabase/migrations/20260721180000_jobs_only_employer_onboarding.sql"
);
const signupAction = source("src/app/jobs/post/actions.ts");
const adminLayout = source("src/app/admin/layout.tsx");
const adminShell = source("src/components/admin/AdminShell.tsx");
const middleware = source("src/middleware.ts");
const jobsActions = source("src/app/admin/jobs/actions.ts");
const adminAuth = source("src/lib/super-admin-auth.ts");
const jobsPage = source("src/app/jobs/page.tsx");

describe("jobs-only employer onboarding", () => {
  it("creates a distinct tenant mode without granting browser access to signup data", () => {
    expect(migration).toContain(
      "add column if not exists jobs_only boolean not null default false"
    );
    expect(migration).toContain(
      "alter table public.job_employer_signup_attempts enable row level security"
    );
    expect(migration).toContain(
      "revoke all on table public.job_employer_signup_attempts\nfrom public, anon, authenticated"
    );
    expect(migration).toContain(
      "grant all on table public.job_employer_signup_attempts to service_role"
    );
  });

  it("serializes and limits public signup attempts using hashed identifiers", () => {
    expect(migration).toContain("create or replace function public.reserve_job_employer_signup");
    expect(migration).toContain("jobs-signup-email:");
    expect(migration).toContain("jobs-signup-client:");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toMatch(
      /grant execute on function public\.reserve_job_employer_signup\([\s\S]*?\)\nto service_role/
    );
    expect(signupAction).toContain('createHash("sha256")');
    expect(signupAction).not.toContain("demo_ip_hash");
  });

  it("provisions only a Jobs tenant and reuses verified email invitations", () => {
    expect(signupAction).toContain("jobs_only: true");
    expect(signupAction).toContain("inviteRestaurantUser(");
    expect(signupAction).toContain('status: "trial"');
    expect(signupAction).not.toContain('.from("subscriptions")');
    expect(signupAction).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("enforces the Jobs-only route boundary with a middleware-owned pathname", () => {
    expect(middleware).toContain(
      'requestHeaders.set("x-whatsorder-pathname", request.nextUrl.pathname)'
    );
    expect(adminLayout).toContain('get("x-whatsorder-pathname")');
    expect(adminLayout).toContain('pathname.startsWith("/admin/jobs/")');
    expect(adminLayout).toContain("if (jobsOnly && !isJobsPath)");
    expect(adminLayout).toContain('redirect("/admin/jobs")');
    expect(adminShell).toContain('if (jobsOnly) return item.href === "/admin/jobs"');
    expect(adminAuth).toContain("resolution.session.restaurant.jobs_only && !options.allowJobsOnly");
    expect(jobsActions).toContain("allowJobsOnly: true");
  });

  it("limits free accounts and sends the public CTA to self-service onboarding", () => {
    expect(jobsActions).toContain("if (session.restaurant.jobs_only)");
    expect(jobsActions).toContain("(count ?? 0) >= 3");
    expect(jobsPage).toContain('href="/jobs/post"');
  });
});
