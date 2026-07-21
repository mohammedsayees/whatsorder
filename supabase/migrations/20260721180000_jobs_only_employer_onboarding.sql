-- Subscription-free employer onboarding for WhatsOrder Jobs.
-- Jobs-only tenants remain isolated restaurant tenants, have no subscription,
-- and are rate-limited through a service-role-only reservation function.

alter table public.restaurants
add column if not exists jobs_only boolean not null default false;

comment on column public.restaurants.jobs_only is
  'Restricts this tenant to the WhatsOrder Jobs workspace. No subscription is created.';

create table if not exists public.job_employer_signup_attempts (
  id uuid primary key default gen_random_uuid(),
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  client_fingerprint text not null check (client_fingerprint ~ '^[a-f0-9]{64}$'),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  status text not null default 'reserved' check (status in (
    'reserved', 'invited', 'failed'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists job_employer_signup_email_created_idx
on public.job_employer_signup_attempts (email_hash, created_at desc);

create index if not exists job_employer_signup_client_created_idx
on public.job_employer_signup_attempts (client_fingerprint, created_at desc);

alter table public.job_employer_signup_attempts enable row level security;

revoke all on table public.job_employer_signup_attempts
from public, anon, authenticated;
grant all on table public.job_employer_signup_attempts to service_role;

create or replace function public.reserve_job_employer_signup(
  requested_email_hash text,
  requested_client_fingerprint text,
  requested_email_limit integer default 1,
  requested_client_limit integer default 3,
  requested_window_seconds integer default 86400
)
returns uuid
language plpgsql
security definer
set search_path = public
as $reserve_job_employer_signup$
declare
  reservation_id uuid;
  recent_email_attempts integer;
  recent_client_attempts integer;
begin
  if requested_email_hash !~ '^[a-f0-9]{64}$'
     or requested_client_fingerprint !~ '^[a-f0-9]{64}$'
     or requested_email_limit < 1
     or requested_client_limit < 1
     or requested_window_seconds < 60 then
    raise exception 'Invalid signup reservation';
  end if;

  -- Lock both dimensions in a stable order so parallel requests sharing only
  -- an email or only a client fingerprint cannot overrun either quota.
  perform pg_advisory_xact_lock(
    hashtextextended('jobs-signup-email:' || requested_email_hash, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended('jobs-signup-client:' || requested_client_fingerprint, 0)
  );

  delete from public.job_employer_signup_attempts
  where created_at < now() - interval '30 days';

  select count(*) into recent_email_attempts
  from public.job_employer_signup_attempts
  where email_hash = requested_email_hash
    and status in ('reserved', 'invited')
    and created_at >= now() - make_interval(secs => requested_window_seconds);

  select count(*) into recent_client_attempts
  from public.job_employer_signup_attempts
  where client_fingerprint = requested_client_fingerprint
    and created_at >= now() - make_interval(secs => requested_window_seconds);

  if recent_email_attempts >= requested_email_limit
     or recent_client_attempts >= requested_client_limit then
    return null;
  end if;

  insert into public.job_employer_signup_attempts (
    email_hash, client_fingerprint
  ) values (
    requested_email_hash, requested_client_fingerprint
  ) returning id into reservation_id;

  return reservation_id;
end;
$reserve_job_employer_signup$;

revoke all on function public.reserve_job_employer_signup(text, text, integer, integer, integer)
from public, anon, authenticated;
grant execute on function public.reserve_job_employer_signup(text, text, integer, integer, integer)
to service_role;

-- Fail the migration if browser roles gain access to the signup audit trail.
do $verify_jobs_only_onboarding$
begin
  if has_table_privilege('anon', 'public.job_employer_signup_attempts', 'select')
     or has_table_privilege('authenticated', 'public.job_employer_signup_attempts', 'select')
     or has_function_privilege(
       'anon',
       'public.reserve_job_employer_signup(text,text,integer,integer,integer)',
       'execute'
     )
     or has_function_privilege(
       'authenticated',
       'public.reserve_job_employer_signup(text,text,integer,integer,integer)',
       'execute'
     ) then
    raise exception 'Jobs-only onboarding least-privilege verification failed';
  end if;
end;
$verify_jobs_only_onboarding$;
