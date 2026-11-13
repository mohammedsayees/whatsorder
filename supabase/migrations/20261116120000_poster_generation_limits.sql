-- WhatsOrder: Poster Studio generation cost control and retention
-- (Marketing Phase 2).
--
-- 1) public.poster_generation_attempts + check_poster_generation_rate_limit —
--    per-restaurant rate limit on POST /api/poster/generate, same posture as
--    check_finance_scan_rate_limit: an advisory lock serialises concurrent
--    checks for one restaurant, so a burst of clicks can't all slip under the
--    cap. The limit and window are passed in from code (one constant).
--    Attempts are counted, not successes: a failed generation still cost a
--    model call.
-- 2) delete_expired_rendered_posters — retention: removes posters that were
--    only ever rendered (never sent) and are older than the given age, and
--    never a poster that has any marketing_sends row (also enforced by the
--    ON DELETE RESTRICT FK from 20261116090000_marketing_sends.sql). Returns
--    the storage paths so the caller removes the PNGs.
--
-- Tables are tenant-scoped read-only for members; all writes and both
-- functions are service-role only.

-- ── rate limit ──────────────────────────────────────────────────────────────

create table if not exists public.poster_generation_attempts (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id       uuid,
  created_at    timestamptz not null default now()
);

create index if not exists poster_generation_attempts_restaurant_created_idx
  on public.poster_generation_attempts (restaurant_id, created_at desc);

alter table public.poster_generation_attempts enable row level security;

drop policy if exists poster_generation_attempts_member_read
  on public.poster_generation_attempts;
create policy poster_generation_attempts_member_read
  on public.poster_generation_attempts
  for select
  to authenticated
  using (public.is_restaurant_member(restaurant_id));

-- Returns 0 and records the attempt when allowed; otherwise the number of
-- seconds until the oldest attempt in the window ages out.
create or replace function public.check_poster_generation_rate_limit(
  target_restaurant_id uuid,
  target_user_id uuid,
  max_attempts integer,
  window_seconds integer
)
returns integer
language plpgsql
security invoker
set search_path = public
as $check_poster_generation_rate_limit$
declare
  window_start timestamptz := now() - make_interval(secs => window_seconds);
  recent_count integer;
  oldest_in_window timestamptz;
begin
  if target_restaurant_id is null or max_attempts < 1 or window_seconds < 1 then
    raise exception 'invalid poster rate limit arguments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target_restaurant_id::text || ':poster-generate', 0
  ));

  delete from public.poster_generation_attempts
  where restaurant_id = target_restaurant_id
    and created_at < now() - interval '2 days';

  select count(*), min(created_at)
    into recent_count, oldest_in_window
  from public.poster_generation_attempts
  where restaurant_id = target_restaurant_id
    and created_at >= window_start;

  if recent_count >= max_attempts then
    return greatest(
      1,
      ceil(extract(epoch from (oldest_in_window + make_interval(secs => window_seconds) - now())))::integer
    );
  end if;

  insert into public.poster_generation_attempts (restaurant_id, user_id)
  values (target_restaurant_id, target_user_id);
  return 0;
end;
$check_poster_generation_rate_limit$;

-- ── retention ───────────────────────────────────────────────────────────────

create or replace function public.delete_expired_rendered_posters(
  older_than_days integer,
  max_rows integer default 500
)
returns table (restaurant_id uuid, storage_path text)
language plpgsql
security invoker
set search_path = public
as $delete_expired_rendered_posters$
begin
  if older_than_days < 1 or max_rows < 1 then
    raise exception 'invalid poster retention arguments';
  end if;

  return query
  with doomed as (
    select p.id
    from public.posters p
    where p.status = 'rendered'
      and p.created_at < now() - make_interval(days => older_than_days)
      and not exists (
        select 1 from public.marketing_sends s
        where s.poster_id = p.id
          and s.restaurant_id = p.restaurant_id
      )
    order by p.created_at
    limit max_rows
    for update skip locked
  )
  delete from public.posters p
  using doomed
  where p.id = doomed.id
  returning p.restaurant_id, p.storage_path;
end;
$delete_expired_rendered_posters$;

revoke all on function
  public.check_poster_generation_rate_limit(uuid, uuid, integer, integer),
  public.delete_expired_rendered_posters(integer, integer)
from public, anon, authenticated;
grant execute on function
  public.check_poster_generation_rate_limit(uuid, uuid, integer, integer),
  public.delete_expired_rendered_posters(integer, integer)
to service_role;

-- ── self-verification ───────────────────────────────────────────────────────

do $verify_poster_generation_limits$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'poster_generation_attempts'
      and c.relrowsecurity
  ) then
    raise exception 'poster_generation_attempts must have row level security enabled';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'poster_generation_attempts'
      and cmd <> 'SELECT'
  ) then
    raise exception 'poster_generation_attempts must not have write policies (service-role writes only)';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.delete_expired_rendered_posters(integer, integer)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.check_poster_generation_rate_limit(uuid, uuid, integer, integer)',
    'execute'
  ) then
    raise exception 'poster limit/retention functions must be service-role only';
  end if;
end;
$verify_poster_generation_limits$;

notify pgrst, 'reload schema';
