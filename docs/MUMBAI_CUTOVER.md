# Sydney → Mumbai cutover: runbook and settings checklist

This covers what the migration scripts do not: freezing writes on Sydney, and the project settings that do not travel with a database dump.

**In the rehearsal, never freeze Sydney:** it is production, and the freeze stops every order. Instead, practise `freeze`, the API check in step 5, and `unfreeze` on the rehearsal (Mumbai) project. Point `$OLD_*` at it for that test only. Run everything else as written.

Scripts used:

| Script | What it does |
|---|---|
| `scripts/freeze-old-project.sql` | Blocks every app write on Sydney (all public tables, plus Auth and Storage). Has a rollback. |
| `scripts/copy-storage-buckets.mjs` | Copies storage file bytes (`plan`, `copy`, `verify`). |
| `scripts/rewrite-storage-urls.sql` | Rewrites stored Sydney storage URLs to Mumbai. |
| `scripts/rehearsal-checks.mjs` | Compares the two databases: rows, permissions, and the definitions of policies, functions, triggers, indexes, constraints, buckets and API role settings. |

## Why Sydney has to be frozen in the database

Maintenance mode (`MAINTENANCE_MODE=true`) only applies to the deployment it was built into. All of these keep writing to Sydney with the old keys:

- Older Vercel deployments, including open browser tabs when Skew Protection is on. Those tabs still post server actions, including orders.
- The WhatsApp Web connector service.
- Meta webhook retries and cron calls that reach an old deployment.

Anything written to Sydney after the final dump is lost. The freeze turns those writes into errors, so nothing is silently dropped.

## Cutover steps

1. **Before the window:** complete the settings checklist below on Mumbai, and fix every FAIL from the last rehearsal.
2. **Maintenance on:** set `MAINTENANCE_MODE=true` on production and redeploy.
3. **Stop the WhatsApp Web connector,** or accept that inbound messages during the window are dropped. The connector retries for about 1.5 seconds, then discards the event (audit finding 11).
4. **Freeze Sydney:**

   ```bash
   psql "$OLD_DB_URL" -X -v ON_ERROR_STOP=1 -v action=freeze -f scripts/freeze-old-project.sql
   ```

   - `frozen_tables` must equal `public_tables`. This part is what stops API writes: every write that did not log in as `postgres` is rejected, including service-role server actions and SECURITY DEFINER RPCs such as order creation.
   - The Auth and Storage roles should show `default_transaction_read_only=on`. If it prints `NOT FROZEN`, sign-ups and uploads made after the dump are lost; decide whether that is acceptable for the window. If it says sessions "could not be ended", restart the Sydney project (Dashboard → Settings → General → Restart project), then run `-v action=status`.
   - A role-level read-only setting alone would not be enough for the API: PostgREST opens write requests with `BEGIN ... READ WRITE`, which overrides it. That is why public tables use triggers.
5. **Verify the freeze through the API.** This must fail with code `25006` (read-only transaction). It touches no rows either way.

   ```bash
   curl -s -X PATCH "$OLD_SUPABASE_URL/rest/v1/restaurants?id=eq.00000000-0000-0000-0000-000000000000" \
     -H "apikey: $OLD_SERVICE_ROLE_KEY" -H "Authorization: Bearer $OLD_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" -d '{"name":"freeze-check"}'
   ```

   - If it returns `[]` or `204` instead, the freeze is **not** active. Do not dump.
6. **Final dump, then restore to Mumbai.**
   - **Then unfreeze Mumbai straight away.** The dump carries the freeze triggers, so Mumbai rejects every app write until you do:

     ```bash
     psql "$NEW_DB_URL" -X -v ON_ERROR_STOP=1 -v action=unfreeze -f scripts/freeze-old-project.sql
     ```

   - `rehearsal-checks` FAILs ("Cutover freeze removed from new DB") if this is skipped.
7. **Rewrite storage URLs:** run `scripts/rewrite-storage-urls.sql` on Mumbai.
8. **Copy storage, then verify it:**

   ```bash
   node scripts/copy-storage-buckets.mjs copy
   ```

   ```bash
   node scripts/copy-storage-buckets.mjs verify
   ```

   - The resume file is now named after the target project (`storage-copy-state-<ref>.txt`), and its first line records that target.
   - A leftover rehearsal file is refused, not trusted. Do not delete it to get past the error unless it really belongs to an old target.
9. **Run the data checks:**

   ```bash
   node scripts/rehearsal-checks.mjs --old-ref <sydney ref> --mode cutover
   ```

   - Every check must PASS. The freeze on Sydney (triggers and role settings) is ignored when comparing.
10. **Switch Vercel to Mumbai:** update `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to the Mumbai values, set `MAINTENANCE_MODE=false`, then redeploy.
11. **Smoke test:** place an order, accept it in the dashboard, check that the live update arrives, send a WhatsApp reply, and upload a menu image.
12. **Restart the WhatsApp Web connector.**
13. **Leave Sydney frozen** until it is decommissioned. Old deployments then fail loudly instead of writing to a database nobody reads.

**Rollback before step 10:** run `-v action=unfreeze` on Sydney, then redeploy with maintenance off and the Sydney keys. Do not unfreeze after Mumbai has taken writes.

## Settings that do not travel with the dump

Copy each value from Sydney, check it on Mumbai, and tick it off. `rehearsal-checks.mjs` cannot see these.

**API (Dashboard → Settings → API / Data API)**
- [ ] **Max rows.** Reports, CSV exports and credit balances read more than 1,000 rows (audit finding 5). Set it at least as high as Sydney's. Sydney itself must be checked too.
- [ ] Exposed schemas and extra search path.

**Auth (Dashboard → Authentication)**
- [ ] Site URL.
- [ ] Redirect URLs: production domain, `www`, Vercel preview pattern if used.
- [ ] "Allow new users to sign up". Self-serve claim (`/try/claim`) depends on it.
- [ ] Email provider on; "Confirm email" setting matches Sydney.
- [ ] Email templates (magic link, invite, recovery, confirm), copied verbatim.
- [ ] Custom SMTP host, port, user, password and sender. Without it, Supabase's default sender is heavily rate-limited.
- [ ] Auth rate limits, OTP expiry, JWT expiry.
- [ ] Phone provider (if used).

**Database (Dashboard → Database / Settings → Database)**
- [ ] Postgres major version same as Sydney. If it differs, expect `rehearsal-checks` definition diffs to be formatting only, and inspect each one.
- [ ] Connection pooler mode and pool size.
- [ ] Network restrictions and SSL enforcement.
- [ ] Role settings such as `statement_timeout` on `authenticated` / `anon` / `authenticator`. These are compared by `rehearsal-checks` ("API role settings"), but they have to be set by hand.

**Storage (Dashboard → Storage → Settings)**
- [ ] Global upload size limit at least as high as the largest bucket limit (16 MB for `whatsapp-media`).
- [ ] Image transformations on or off, matching Sydney.

**Realtime**
- [ ] Realtime enabled; `orders` and `whatsapp_messages` published. The publication is checked by `rehearsal-checks`.

**Outside Supabase**
- [ ] Vercel env vars (step 10). Mumbai has a new JWT secret, so the anon and service-role keys change.
- [ ] Vercel function region already `bom1` (merged in mohammedsayees/whatsorder#100).
- [ ] WhatsApp Web connector env pointing at the app URL (unchanged unless the domain moves).
- [ ] Meta webhook URL unchanged (it points at the app, not Supabase).
