# WhatsOrder Jobs — Phase 1

WhatsOrder Jobs is a lightweight UAE hospitality job board. Restaurant management can publish structured vacancies; candidates browse without an account and apply through WhatsApp.

## Architecture and security

- Management routes: `/admin/jobs`, `/admin/jobs/new`, `/admin/jobs/[jobId]/edit`.
- Public routes: `/jobs`, `/jobs/[jobId]`.
- `jobs`, `job_reports`, and `job_events` are tenant-owned and carry `restaurant_id`.
- Authenticated browser access is SELECT-only and RLS limits job reads to `restaurant_admin`, `owner`, or `manager` memberships (plus the existing super-admin helper). Raw reports and event fingerprints are super-admin-only; employer counters are read through the authenticated server-rendered page.
- Public users cannot select the `jobs` table. `get_public_jobs` is a column-limited projection that returns only published, unexpired jobs for active restaurants. It omits tenant IDs, creator IDs, owner details, reports, and internal fields.
- All mutations use the service-role client only after server-side auth. Job actions derive `restaurant_id` from the verified session and scope every update/delete to it.
- Reports and anonymous events go through service-role-only RPCs. They store only optional report contact plus salted one-way request fingerprints: reports are limited to three per job per hour, and duplicate events within five minutes are ignored. No raw IP or user-agent is stored.

## Lifecycle

Supported statuses are extensible, but Phase 1 employer flows use `draft`, `published`, `unpublished`, `closed`, and effective `expired`. Public reads require `status = published` and `expires_at > now()`. Publishing and republishing use UTC timestamps; republishing starts a fresh 30-day period.

## Local setup

Apply `supabase/migrations/20260721120000_jobs_phase1.sql` before deploying the application. Optionally set a high-entropy `JOB_REPORT_SALT` in Vercel and local server environments. The fallback is functional but a deployment-specific salt provides better unlinkability.

Demo data is intentionally not automatic. On a local database only:

```sql
set app.environment = 'development';
\i supabase/seed_jobs_phase1.sql
```

## Manual QA checklist

- Sign in as owner, manager, staff, and a user from another restaurant.
- Confirm owner/manager can create, edit, publish, unpublish, close, and republish; staff cannot see Team · Jobs.
- Confirm only owner/restaurant admin can delete a draft.
- Attempt to alter or add `restaurant_id` in a form request and verify the session tenant is still used.
- Browse `/jobs` signed out; test keyword, emirate, city, category, immediate-joining, accommodation, empty state, and pagination.
- Confirm draft, closed, unpublished, and past-expiry jobs return 404 publicly.
- Open Apply on WhatsApp on iOS, Android, and desktop and verify the normalized number and prefilled message.
- Test Web Share and clipboard fallback; verify application/share counters appear in admin.
- Submit each report reason, test optional contact, and verify the fourth same-client report within one hour is rate-limited.
- Confirm hidden restaurant names and exact locations do not appear in page HTML or public RPC responses.
- Verify mobile layouts at 320 px and 390 px widths, keyboard focus, and the report dialog.

## Deferred

Candidate accounts, CVs/documents, internal chat, scheduling, matching, billing/promotions, moderation UI, agency workflows, and discriminatory gender/nationality filters are intentionally excluded.
