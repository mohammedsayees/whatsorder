-- Owner WhatsApp login, step 2 (owner types phone, gets a code on WhatsApp).
-- Builds on 20261212090000_owner_whatsapp_login.sql.
--
-- 1) owner_login_requests.attempts: wrong codes are counted per request; after
--    the cap the request is dead and a new code is needed.
-- 2) owner_login_ip_attempts + check_owner_login_ip_rate_limit: a per-IP cap on
--    code requests, recorded for EVERY request (known number or not), so the
--    login page cannot be used to probe which numbers are registered or to
--    run up WhatsApp costs.
-- 3) start_owner_code_verification / finish_owner_code_login: count an attempt
--    atomically before Supabase checks the code; mark the request used after.
--
-- Service-role only throughout. No anon/authenticated policies or grants.

-- ── 1) attempts ─────────────────────────────────────────────────────────────

alter table public.owner_login_requests
  add column if not exists attempts integer not null default 0;

-- ── 2) per-IP limit ─────────────────────────────────────────────────────────

create table if not exists public.owner_login_ip_attempts (
  id         uuid primary key default gen_random_uuid(),
  ip_hash    text not null,
  created_at timestamptz not null default now()
);

create index if not exists owner_login_ip_attempts_ip_created_idx
  on public.owner_login_ip_attempts (ip_hash, created_at desc);

alter table public.owner_login_ip_attempts enable row level security;
revoke all on table public.owner_login_ip_attempts from anon, authenticated;

-- Records the attempt and returns true when under the cap; false otherwise
-- (and records nothing).
create or replace function public.check_owner_login_ip_rate_limit(
  target_ip_hash text,
  max_attempts integer,
  window_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $check_owner_login_ip_rate_limit$
declare
  recent_count integer;
begin
  if target_ip_hash is null or max_attempts < 1 or window_seconds < 1 then
    raise exception 'invalid owner login ip rate limit arguments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_ip_hash || ':owner-login-ip', 0));

  delete from public.owner_login_ip_attempts
  where created_at < now() - interval '1 day';

  select count(*) into recent_count
  from public.owner_login_ip_attempts
  where ip_hash = target_ip_hash
    and created_at >= now() - make_interval(secs => window_seconds);

  if recent_count >= max_attempts then
    return false;
  end if;

  insert into public.owner_login_ip_attempts (ip_hash) values (target_ip_hash);
  return true;
end;
$check_owner_login_ip_rate_limit$;

-- ── 3) code verification ────────────────────────────────────────────────────

-- Counts one attempt against the newest live code request for this phone and
-- returns it; returns nothing when there is no live request or the attempts
-- are used up.
create or replace function public.start_owner_code_verification(
  target_phone_e164 text,
  max_attempts integer
)
returns table (
  request_id uuid,
  restaurant_id uuid,
  restaurant_user_id uuid
)
language plpgsql
security invoker
set search_path = public
as $start_owner_code_verification$
#variable_conflict use_column
begin
  if target_phone_e164 is null or max_attempts < 1 or max_attempts > 20 then
    raise exception 'invalid owner code verification arguments';
  end if;

  return query
  with candidate as (
    select r.id
    from public.owner_login_requests r
    where r.phone_e164 = target_phone_e164
      and r.kind = 'code'
      and r.sent_at is not null
      and r.used_at is null
      and r.expires_at > now()
      and r.attempts < max_attempts
    order by r.created_at desc
    limit 1
    for update
  )
  update public.owner_login_requests r
  set attempts = r.attempts + 1
  from candidate
  where r.id = candidate.id
  returning r.id, r.restaurant_id, r.restaurant_user_id;
end;
$start_owner_code_verification$;

create or replace function public.finish_owner_code_login(
  target_request_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $finish_owner_code_login$
begin
  update public.owner_login_requests
  set used_at = now()
  where id = target_request_id
    and kind = 'code'
    and used_at is null;
  return found;
end;
$finish_owner_code_login$;

revoke all on function public.check_owner_login_ip_rate_limit(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.start_owner_code_verification(text, integer)
  from public, anon, authenticated;
revoke all on function public.finish_owner_code_login(uuid)
  from public, anon, authenticated;
grant execute on function public.check_owner_login_ip_rate_limit(text, integer, integer)
  to service_role;
grant execute on function public.start_owner_code_verification(text, integer)
  to service_role;
grant execute on function public.finish_owner_code_login(uuid)
  to service_role;

-- ── self-verification ───────────────────────────────────────────────────────

do $verify_owner_whatsapp_code_login$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('owner_login_requests', 'owner_login_ip_attempts')
  ) then
    raise exception 'owner login request tables must have no policies';
  end if;

  if has_table_privilege('anon', 'public.owner_login_ip_attempts', 'select')
     or has_table_privilege('authenticated', 'public.owner_login_ip_attempts', 'select') then
    raise exception 'owner_login_ip_attempts must be service-role only';
  end if;

  if has_function_privilege('anon', 'public.check_owner_login_ip_rate_limit(text, integer, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.check_owner_login_ip_rate_limit(text, integer, integer)', 'execute')
     or has_function_privilege('anon', 'public.start_owner_code_verification(text, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.start_owner_code_verification(text, integer)', 'execute')
     or has_function_privilege('anon', 'public.finish_owner_code_login(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.finish_owner_code_login(uuid)', 'execute') then
    raise exception 'owner code login functions must be service-role only';
  end if;
end;
$verify_owner_whatsapp_code_login$;

notify pgrst, 'reload schema';
