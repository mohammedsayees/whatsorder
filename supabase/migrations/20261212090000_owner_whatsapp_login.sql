-- Owner WhatsApp login, step 1 (super-admin "Send login link on WhatsApp").
--
-- 1) restaurant_users: a member can be identified by a verified phone instead
--    of (or as well as) an email. email becomes nullable; every row still has
--    at least one of the two.
-- 2) owner_login_requests: one row per link/code send. Service-role only. The
--    login code itself is never stored. A link is /auth/wa/<request id>.<code>:
--    the random request id finds the row, the Supabase code is the secret.
-- 3) owner_auth_events: append-only audit of sends, logins and phone changes.
--    Super-admins read everything; restaurant owners read their own tenant.
-- 4) reserve_owner_login_request: rate limit + request insert in one
--    serialised step, so a burst of clicks cannot slip past the caps.
-- 5) claim_owner_login_request_for_send / consume_owner_login_link: the hook
--    sends only for a request WhatsOrder made, and a link works once.
--
-- RLS posture is unchanged: no anon/authenticated write policies anywhere.

-- ── 1) restaurant_users ─────────────────────────────────────────────────────

alter table public.restaurant_users
  alter column email drop not null;

alter table public.restaurant_users
  add column if not exists phone_e164 text,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists phone_verified_by uuid;

alter table public.restaurant_users
  drop constraint if exists restaurant_users_phone_e164_format;
alter table public.restaurant_users
  add constraint restaurant_users_phone_e164_format
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

alter table public.restaurant_users
  drop constraint if exists restaurant_users_contact_check;
alter table public.restaurant_users
  add constraint restaurant_users_contact_check
  check (email is not null or phone_e164 is not null);

-- A verified phone only means something if the phone is there.
alter table public.restaurant_users
  drop constraint if exists restaurant_users_phone_verified_needs_phone;
alter table public.restaurant_users
  add constraint restaurant_users_phone_verified_needs_phone
  check (phone_verified_at is null or phone_e164 is not null);

create unique index if not exists restaurant_users_restaurant_phone_key
  on public.restaurant_users (restaurant_id, phone_e164)
  where phone_e164 is not null;

create index if not exists restaurant_users_phone_idx
  on public.restaurant_users (phone_e164)
  where phone_e164 is not null;

-- ── 2) owner_login_requests ─────────────────────────────────────────────────

create table if not exists public.owner_login_requests (
  id                 uuid primary key default gen_random_uuid(),
  kind               text not null check (kind in ('link', 'code')),
  phone_e164         text not null check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  restaurant_user_id uuid not null references public.restaurant_users(id) on delete cascade,
  restaurant_id      uuid not null references public.restaurants(id) on delete cascade,
  requested_by       uuid,
  requested_ip_hash  text,
  expires_at         timestamptz not null,
  sent_at            timestamptz,
  used_at            timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists owner_login_requests_phone_created_idx
  on public.owner_login_requests (phone_e164, created_at desc);
create index if not exists owner_login_requests_member_created_idx
  on public.owner_login_requests (restaurant_user_id, created_at desc);

alter table public.owner_login_requests enable row level security;
-- No policies: only the service role (which bypasses RLS) reads or writes.
revoke all on table public.owner_login_requests from anon, authenticated;

-- ── 3) owner_auth_events ────────────────────────────────────────────────────

create table if not exists public.owner_auth_events (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references public.restaurants(id) on delete cascade,
  restaurant_user_id uuid references public.restaurant_users(id) on delete set null,
  actor_user_id      uuid,
  event              text not null check (event in (
    'link_sent',
    'link_send_failed',
    'code_sent',
    'login_succeeded',
    'login_failed',
    'phone_added',
    'phone_verified',
    'phone_changed',
    'phone_removed',
    'signed_out_everywhere'
  )),
  channel            text not null default 'whatsapp'
    check (channel in ('whatsapp', 'super_admin')),
  wamid              text,
  detail             text,
  ip_hash            text,
  created_at         timestamptz not null default now()
);

create index if not exists owner_auth_events_restaurant_created_idx
  on public.owner_auth_events (restaurant_id, created_at desc);

alter table public.owner_auth_events enable row level security;
revoke all on table public.owner_auth_events from anon, authenticated;
grant select on table public.owner_auth_events to authenticated;

drop policy if exists owner_auth_events_owner_read on public.owner_auth_events;
create policy owner_auth_events_owner_read
  on public.owner_auth_events
  for select
  to authenticated
  using (
    public.is_super_admin()
    or public.is_restaurant_member(restaurant_id, array['restaurant_admin', 'owner'])
  );

-- ── 4) reserve_owner_login_request ──────────────────────────────────────────
-- Returns the new request id when every cap allows it, otherwise null and
-- writes nothing. Caps are passed in from code (one set of constants).

create or replace function public.reserve_owner_login_request(
  target_kind text,
  target_phone_e164 text,
  target_restaurant_user_id uuid,
  target_restaurant_id uuid,
  target_requested_by uuid,
  target_ip_hash text,
  ttl_seconds integer,
  max_per_member integer,
  member_window_seconds integer,
  max_per_phone integer,
  phone_window_seconds integer
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $reserve_owner_login_request$
declare
  member_count integer;
  phone_count integer;
  new_id uuid;
begin
  if target_kind not in ('link', 'code')
     or target_phone_e164 is null
     or target_restaurant_user_id is null
     or target_restaurant_id is null
     or ttl_seconds < 60 or ttl_seconds > 3600
     or max_per_member < 1 or member_window_seconds < 1
     or max_per_phone < 1 or phone_window_seconds < 1 then
    raise exception 'invalid owner login request arguments';
  end if;

  -- The membership must belong to the tenant and carry this verified phone.
  if not exists (
    select 1 from public.restaurant_users m
    where m.id = target_restaurant_user_id
      and m.restaurant_id = target_restaurant_id
      and m.phone_e164 = target_phone_e164
      and m.phone_verified_at is not null
  ) then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    target_phone_e164 || ':owner-login', 0
  ));

  -- Housekeeping: requests only matter for a day.
  delete from public.owner_login_requests
  where created_at < now() - interval '1 day';

  select count(*) into member_count
  from public.owner_login_requests
  where restaurant_user_id = target_restaurant_user_id
    and created_at >= now() - make_interval(secs => member_window_seconds);

  select count(*) into phone_count
  from public.owner_login_requests
  where phone_e164 = target_phone_e164
    and created_at >= now() - make_interval(secs => phone_window_seconds);

  if member_count >= max_per_member or phone_count >= max_per_phone then
    return null;
  end if;

  insert into public.owner_login_requests (
    kind, phone_e164, restaurant_user_id, restaurant_id,
    requested_by, requested_ip_hash, expires_at
  ) values (
    target_kind, target_phone_e164, target_restaurant_user_id,
    target_restaurant_id, target_requested_by, target_ip_hash,
    now() + make_interval(secs => ttl_seconds)
  )
  returning id into new_id;

  return new_id;
end;
$reserve_owner_login_request$;

revoke all on function public.reserve_owner_login_request(
  text, text, uuid, uuid, uuid, text, integer, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.reserve_owner_login_request(
  text, text, uuid, uuid, uuid, text, integer, integer, integer, integer, integer
) to service_role;

-- ── 5) claim / consume ──────────────────────────────────────────────────────
-- The Send SMS hook claims the newest fresh, unsent request for a phone. A
-- code Supabase generates for any other reason (e.g. someone calling the
-- public OTP endpoint with a registered phone) finds nothing to claim, and
-- the hook refuses to send it.

create or replace function public.claim_owner_login_request_for_send(
  target_phone_e164 text,
  max_age_seconds integer
)
returns table (
  request_id uuid,
  request_kind text,
  restaurant_id uuid,
  restaurant_user_id uuid
)
language plpgsql
security invoker
set search_path = public
as $claim_owner_login_request_for_send$
#variable_conflict use_column
begin
  if target_phone_e164 is null or max_age_seconds < 1 or max_age_seconds > 600 then
    raise exception 'invalid owner login claim arguments';
  end if;

  return query
  with candidate as (
    select r.id
    from public.owner_login_requests r
    where r.phone_e164 = target_phone_e164
      and r.sent_at is null
      and r.used_at is null
      and r.expires_at > now()
      and r.created_at >= now() - make_interval(secs => max_age_seconds)
    order by r.created_at desc
    limit 1
    for update skip locked
  )
  update public.owner_login_requests r
  set sent_at = now()
  from candidate
  where r.id = candidate.id
  returning r.id, r.kind, r.restaurant_id, r.restaurant_user_id;
end;
$claim_owner_login_request_for_send$;

-- A link works once: the first redemption marks it used and returns the
-- phone to verify the code against; any later call returns nothing.
create or replace function public.consume_owner_login_link(
  target_request_id uuid
)
returns table (
  phone_e164 text,
  restaurant_id uuid,
  restaurant_user_id uuid
)
language plpgsql
security invoker
set search_path = public
as $consume_owner_login_link$
#variable_conflict use_column
begin
  return query
  update public.owner_login_requests r
  set used_at = now()
  where r.id = target_request_id
    and r.kind = 'link'
    and r.sent_at is not null
    and r.used_at is null
    and r.expires_at > now()
  returning r.phone_e164, r.restaurant_id, r.restaurant_user_id;
end;
$consume_owner_login_link$;

revoke all on function public.claim_owner_login_request_for_send(text, integer)
  from public, anon, authenticated;
revoke all on function public.consume_owner_login_link(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_owner_login_request_for_send(text, integer)
  to service_role;
grant execute on function public.consume_owner_login_link(uuid)
  to service_role;

-- ── self-verification ───────────────────────────────────────────────────────

do $verify_owner_whatsapp_login$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('owner_login_requests', 'owner_auth_events')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'owner login tables must not have write policies';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.reserve_owner_login_request(text, text, uuid, uuid, uuid, text, integer, integer, integer, integer, integer)',
    'execute'
  ) then
    raise exception 'reserve_owner_login_request must be service-role only';
  end if;

  if has_function_privilege('authenticated', 'public.claim_owner_login_request_for_send(text, integer)', 'execute')
     or has_function_privilege('anon', 'public.claim_owner_login_request_for_send(text, integer)', 'execute')
     or has_function_privilege('authenticated', 'public.consume_owner_login_link(uuid)', 'execute')
     or has_function_privilege('anon', 'public.consume_owner_login_link(uuid)', 'execute') then
    raise exception 'owner login claim/consume functions must be service-role only';
  end if;
end;
$verify_owner_whatsapp_login$;

notify pgrst, 'reload schema';
