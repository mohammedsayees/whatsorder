-- Freeze writes on the OLD (Sydney) project at cutover, so nothing written
-- after the final dump is lost (old Vercel deployments, open browser tabs,
-- the WhatsApp connector, Meta webhooks and crons all keep their Sydney keys).
-- See docs/MUMBAI_CUTOVER.md, step "Freeze Sydney".
--
--   psql "$OLD_DB_URL" -X -v ON_ERROR_STOP=1 -v action=freeze   -f scripts/freeze-old-project.sql
--   psql "$OLD_DB_URL" -X -v ON_ERROR_STOP=1 -v action=status   -f scripts/freeze-old-project.sql
--   psql "$OLD_DB_URL" -X -v ON_ERROR_STOP=1 -v action=unfreeze -f scripts/freeze-old-project.sql
--
-- freeze    1. Every public table gets a statement trigger "zz_cutover_freeze"
--              that rejects INSERT / UPDATE / DELETE / TRUNCATE (SQLSTATE
--              25006) unless the connection logged in as postgres or
--              supabase_admin. This covers PostgREST for anon, authenticated
--              AND service_role (server actions, crons, webhooks), including
--              SECURITY DEFINER RPCs such as order creation: session_user
--              stays "authenticator" inside them. A role-level
--              default_transaction_read_only would NOT do this: PostgREST
--              opens write requests with BEGIN ... READ WRITE.
--           2. Auth and Storage roles get default_transaction_read_only = on
--              (their services use plain BEGIN) and their open sessions end.
--              Roles this login may not alter are reported, not skipped
--              silently.
--           Reads keep working.
-- status    lists frozen tables and role settings.
-- unfreeze  removes all of it. ALSO RUN IT ON THE NEW PROJECT right after
--           restoring a dump taken while frozen: the triggers are in the dump.
--           scripts/rehearsal-checks.mjs fails if any are left on the new DB.
--
-- Your own psql session (postgres) and pg_dump are not affected.

\if :{?action}
\else
  \echo 'Set -v action=freeze, status or unfreeze'
  \quit
\endif

select :'action' in ('freeze', 'status', 'unfreeze') as action_ok,
       :'action' = 'freeze' as is_freeze,
       :'action' = 'unfreeze' as is_unfreeze \gset
\if :action_ok
\else
  \echo 'Unknown action: use freeze, status or unfreeze'
  \quit
\endif

\if :is_freeze
create schema if not exists cutover_freeze;
revoke all on schema cutover_freeze from public;

create or replace function cutover_freeze.reject_write()
returns trigger
language plpgsql
set search_path = pg_catalog
as $reject$
begin
  if session_user in ('postgres', 'supabase_admin') then
    return null;
  end if;
  raise exception 'WhatsOrder is moving to a new database; this one is read-only'
    using errcode = '25006';
end
$reject$;

do $freeze_tables$
declare
  t record;
  frozen int := 0;
begin
  for t in
    select c.oid::regclass as rel
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition
      and not exists (
        select 1 from pg_trigger tg
        where tg.tgrelid = c.oid and tg.tgname = 'zz_cutover_freeze' and not tg.tgisinternal)
  loop
    execute format(
      'create trigger zz_cutover_freeze before insert or update or delete or truncate on %s '
      'for each statement execute function cutover_freeze.reject_write()', t.rel);
    frozen := frozen + 1;
  end loop;
  raise notice 'FROZEN % more public table(s)', frozen;
end
$freeze_tables$;

do $freeze_roles$
declare
  r text;
begin
  foreach r in array array['supabase_auth_admin', 'supabase_storage_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      raise notice 'skip %: role does not exist', r;
      continue;
    end if;
    begin
      execute format('alter role %I set default_transaction_read_only = on', r);
      raise notice 'FROZEN role %', r;
    exception when insufficient_privilege then
      raise warning 'NOT FROZEN role %: not allowed for this login (%). Auth / Storage writes after the dump will be lost.', r, sqlerrm;
    end;
  end loop;
end
$freeze_roles$;
\endif

\if :is_unfreeze
do $unfreeze$
declare
  t record;
  r text;
  removed int := 0;
begin
  for t in
    select tg.tgrelid::regclass as rel
    from pg_trigger tg where tg.tgname = 'zz_cutover_freeze' and not tg.tgisinternal
  loop
    execute format('drop trigger zz_cutover_freeze on %s', t.rel);
    removed := removed + 1;
  end loop;
  raise notice 'UNFROZEN % table(s)', removed;
  drop function if exists cutover_freeze.reject_write();
  drop schema if exists cutover_freeze;

  foreach r in array array['supabase_auth_admin', 'supabase_storage_admin'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      continue;
    end if;
    begin
      execute format('alter role %I reset default_transaction_read_only', r);
      raise notice 'UNFROZEN role %', r;
    exception when insufficient_privilege then
      raise warning 'NOT UNFROZEN role %: not allowed for this login (%)', r, sqlerrm;
    end;
  end loop;
end
$unfreeze$;
\endif

-- Role settings only apply to new sessions: end the open Auth / Storage ones
-- (freeze and unfreeze). Their pools reconnect on their own within seconds.
\if :is_freeze
  \set end_sessions true
\elif :is_unfreeze
  \set end_sessions true
\else
  \set end_sessions false
\endif

\if :end_sessions
do $end_sessions$
declare
  s record;
  ended int := 0;
  refused int := 0;
begin
  for s in
    select pid from pg_stat_activity
    where usename in ('supabase_auth_admin', 'supabase_storage_admin')
      and pid <> pg_backend_pid()
  loop
    begin
      if pg_terminate_backend(s.pid) then ended := ended + 1; end if;
    exception when insufficient_privilege then
      refused := refused + 1;
    end;
  end loop;
  raise notice 'ended % Auth/Storage session(s)', ended;
  if refused > 0 then
    raise warning '% session(s) could not be ended by this login: restart the project (Dashboard > Settings > General > Restart project) so they reconnect with the new setting', refused;
  end if;
end
$end_sessions$;
\endif

select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition) as public_tables,
  (select count(*) from pg_trigger where tgname = 'zz_cutover_freeze' and not tgisinternal) as frozen_tables;

select r.rolname as role,
       coalesce((select setting from unnest(r.rolconfig) setting
                 where setting like 'default_transaction_read_only=%'), 'default_transaction_read_only=(unset)') as setting,
       (select count(*) from pg_stat_activity a where a.usename = r.rolname) as open_sessions
from pg_roles r
where r.rolname in ('supabase_auth_admin', 'supabase_storage_admin')
order by r.rolname;
