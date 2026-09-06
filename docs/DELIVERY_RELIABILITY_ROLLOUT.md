# Delivery reliability rollout (review items 3–7)

Item 3 is already present from PR #78. This delivery adds notification jobs,
owner recap delivery, CI checks, and focused domain/component extractions.

## Migration first

Apply `supabase/migrations/20260907140000_delivery_jobs.sql` before merging.
It creates a service-role-only queue worker RPC and a status-event trigger,
adds recap leases and delivery fields, and updates the dashboard snapshot.
Historical `sent` recaps become `generated` with unknown delivery status:
the old sender never proved delivery. No historical notifications are queued.
New opt-in RPC wrappers enqueue events transactionally. Old application instances
continue using the synchronous RPCs without queueing the same notification, so
migration-first deployment does not double-send during the transition.

## Scheduling and transport

- Configure `CRON_SECRET`. `/api/cron/notifications` fails closed without it.
- Normal staff actions wake a tenant-scoped worker using Next.js `after`.
- The configured minute cron recovers due retries and expired leases. This
  requires Vercel Pro/Enterprise. On Hobby use an authenticated external
  scheduler and remove the minute entry before deployment. Do not expose the
  cron secret in a browser. [Vercel limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- Each invocation claims up to ten jobs within a bounded time budget. Watch
  queue age as traffic grows; increase worker capacity when backlog accumulates.
- WhatsApp uses the existing restaurant transport. Cloud API free-form sends
  require an open service window; daily recaps without a window remain visible
  on the dashboard with skipped delivery. No paid template is sent implicitly.
- Push and WhatsApp network requests have 10-second timeouts. Jobs retry up to
  five attempts with exponential delay. Superseded statuses are skipped.

`accepted` means provider acceptance, not a delivered/read receipt. Event/channel
uniqueness and atomic claims prevent concurrent duplicate jobs. A process crash
or provider timeout after external acceptance can still cause a repeated order
notification on retry; the existing transports do not offer an exactly-once
contract. Push uses a stable order tag. Recaps whose send began but whose outcome
could not be recorded become `unknown`, without automatic resend.

## Check the dashboard

1. Complete a test payment. The action should finish without waiting for WhatsApp.
2. In Supabase, inspect `order_notification_jobs`: one job per channel per event.
   Expected progression is pending → processing → accepted/skipped, or retries
   ending in failed. Failed jobs appear separately on `/admin/orders`.
3. Run the daily recap job on a test tenant. Verify its text persists before any
   send and the dashboard shows acceptance separately from recap generation.
4. Simulate a transport outage, restore it, and verify due jobs are retried.
5. Verify the worker returns 401 without its bearer secret.

## Release checks

Node 22: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`,
`npm run test:connector`, `npm run test:browser`, `npm run test:database`.
Playwright needs `npx playwright install chromium`. Its isolated browser fixture
renders the real confirmation, payment controls and offline queue with controlled
server-action responses. It tests reload/resend, failed payment retry, interrupted
sync and restaurant switching; it does not replace a live Supabase/Vercel smoke
test. Authorization and transaction behavior are covered separately in unit/SQL
checks. No test-only route is shipped inside the Next application.

Database CI creates a disposable PostgreSQL 16 database with Supabase-owned
schema stubs and pgTAP. The runner requires `DATABASE_URL` and
`ALLOW_TEST_DATABASE_RESET=true`; never point it at a live database. It applies
all legacy and timestamped migrations, runs rollback SQL checks, and uses
`pg_prove` so failed TAP assertions fail CI.

## Rollback

Revert application and cron changes together. Before running the previous app,
stop the new worker and leave queued records for inspection. Old synchronous
RPC callers do not activate the enqueue trigger. Preserve queue
records for diagnosis. The additive recap columns can remain.
