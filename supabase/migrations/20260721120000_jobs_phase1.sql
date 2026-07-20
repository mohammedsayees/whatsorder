-- WhatsOrder Jobs Phase 1: lightweight, public hospitality vacancies.
-- Browser roles remain read-only. Public discovery uses column-limited RPCs;
-- every mutation is performed by authenticated, tenant-scoped server code.

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 3 and 100),
  category text not null check (category in (
    'Tea Maker', 'Barista', 'Shawarma Maker', 'Burger Cook', 'Juice Maker',
    'Chef', 'Kitchen Helper', 'Waiter', 'Cashier', 'Cleaner',
    'Delivery Rider', 'Restaurant Supervisor', 'Restaurant Manager', 'Other'
  )),
  employment_type text not null check (employment_type in (
    'Full-time', 'Part-time', 'Temporary', 'Trial', 'Contract'
  )),
  description text check (description is null or char_length(description) <= 2000),
  responsibilities text check (responsibilities is null or char_length(responsibilities) <= 2000),
  requirements text check (requirements is null or char_length(requirements) <= 2000),
  emirate text not null check (emirate in (
    'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman',
    'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'
  )),
  city text not null check (char_length(city) between 2 and 80),
  approximate_location text check (
    approximate_location is null or char_length(approximate_location) <= 160
  ),
  show_restaurant_name boolean not null default true,
  show_exact_location boolean not null default false,
  salary_type text not null check (salary_type in (
    'Fixed monthly', 'Range', 'Negotiable', 'Not disclosed'
  )),
  salary_min numeric(10, 2) check (salary_min is null or salary_min >= 0),
  salary_max numeric(10, 2) check (salary_max is null or salary_max >= 0),
  salary_currency char(3) not null default 'AED' check (salary_currency = 'AED'),
  number_of_vacancies integer not null default 1 check (number_of_vacancies between 1 and 100),
  experience_required text check (
    experience_required is null or char_length(experience_required) <= 160
  ),
  immediate_joining boolean not null default false,
  preferred_joining_date date,
  accommodation_provided boolean not null default false,
  food_provided boolean not null default false,
  visa_provided boolean not null default false,
  working_hours text check (working_hours is null or char_length(working_hours) <= 120),
  weekly_day_off text check (weekly_day_off is null or char_length(weekly_day_off) <= 80),
  preferred_languages text[] not null default '{}',
  contact_whatsapp text not null check (contact_whatsapp ~ '^[1-9][0-9]{7,14}$'),
  application_method text not null default 'whatsapp' check (application_method = 'whatsapp'),
  status text not null default 'draft' check (status in (
    'draft', 'pending_review', 'published', 'unpublished',
    'closed', 'expired', 'rejected'
  )),
  published_at timestamptz,
  expires_at timestamptz,
  closed_at timestamptz,
  whatsapp_apply_clicks bigint not null default 0 check (whatsapp_apply_clicks >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_salary_range_check check (
    salary_min is null or salary_max is null or salary_min <= salary_max
  ),
  constraint jobs_published_dates_check check (
    status <> 'published'
    or (published_at is not null and expires_at is not null and expires_at > published_at)
  ),
  unique (id, restaurant_id)
);

create table if not exists public.job_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  job_id uuid not null,
  reason text not null check (reason in (
    'Fake job', 'Asking candidates for money', 'Misleading salary or details',
    'Duplicate listing', 'Inappropriate content', 'Job no longer available', 'Other'
  )),
  details text check (details is null or char_length(details) <= 1000),
  reporter_contact text check (reporter_contact is null or char_length(reporter_contact) <= 160),
  reporter_fingerprint text check (
    reporter_fingerprint is null or char_length(reporter_fingerprint) = 64
  ),
  status text not null default 'new' check (status in ('new', 'reviewed', 'dismissed', 'resolved')),
  created_at timestamptz not null default now(),
  foreign key (job_id, restaurant_id)
    references public.jobs(id, restaurant_id) on delete cascade
);

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  job_id uuid not null,
  event_type text not null check (event_type in (
    'job_viewed', 'whatsapp_apply_clicked', 'job_shared'
  )),
  visitor_fingerprint text check (
    visitor_fingerprint is null or char_length(visitor_fingerprint) = 64
  ),
  created_at timestamptz not null default now(),
  foreign key (job_id, restaurant_id)
    references public.jobs(id, restaurant_id) on delete cascade
);

create index if not exists jobs_public_status_expiry_idx
  on public.jobs (status, expires_at, published_at desc);
create index if not exists jobs_restaurant_status_idx
  on public.jobs (restaurant_id, status, updated_at desc);
create index if not exists jobs_public_filters_idx
  on public.jobs (emirate, city, category, status, published_at desc);
create index if not exists job_reports_job_created_idx
  on public.job_reports (job_id, created_at desc);
create index if not exists job_reports_rate_limit_idx
  on public.job_reports (job_id, reporter_fingerprint, created_at desc);
create index if not exists job_events_job_type_idx
  on public.job_events (job_id, event_type, visitor_fingerprint, created_at desc);

create or replace function public.set_job_updated_at()
returns trigger
language plpgsql
set search_path = public
as $set_job_updated_at$
begin
  if (to_jsonb(new) - 'whatsapp_apply_clicks' - 'updated_at')
    is distinct from
    (to_jsonb(old) - 'whatsapp_apply_clicks' - 'updated_at') then
    new.updated_at = now();
  else
    new.updated_at = old.updated_at;
  end if;
  return new;
end;
$set_job_updated_at$;

revoke all on function public.set_job_updated_at() from public, anon, authenticated;

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
before update on public.jobs
for each row execute function public.set_job_updated_at();

alter table public.jobs enable row level security;
alter table public.job_reports enable row level security;
alter table public.job_events enable row level security;

create policy "Read jobs (management, super admins)"
on public.jobs for select to authenticated
using (
  public.is_restaurant_member(
    restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
  or public.is_super_admin()
);

create policy "Read job reports (super admins)"
on public.job_reports for select to authenticated
using (public.is_super_admin());

create policy "Read job events (super admins)"
on public.job_events for select to authenticated
using (public.is_super_admin());

revoke all on table public.jobs, public.job_reports, public.job_events
from public, anon, authenticated;
grant select on table public.jobs, public.job_reports, public.job_events
to authenticated;
grant all on table public.jobs, public.job_reports, public.job_events
to service_role;

-- Safe public projection. Tenant IDs, creator IDs, reports, fingerprints, and
-- restaurant owner/internal fields are deliberately absent.
create or replace function public.get_public_jobs(
  requested_job_id uuid default null,
  requested_search text default null,
  requested_emirate text default null,
  requested_city text default null,
  requested_category text default null,
  requested_immediate_joining boolean default null,
  requested_accommodation boolean default null,
  requested_limit integer default 12,
  requested_offset integer default 0
)
returns table (
  id uuid,
  title text,
  category text,
  employment_type text,
  description text,
  responsibilities text,
  requirements text,
  emirate text,
  city text,
  location text,
  restaurant_name text,
  salary_type text,
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  number_of_vacancies integer,
  experience_required text,
  immediate_joining boolean,
  preferred_joining_date date,
  accommodation_provided boolean,
  food_provided boolean,
  visa_provided boolean,
  working_hours text,
  weekly_day_off text,
  preferred_languages text[],
  contact_whatsapp text,
  published_at timestamptz,
  expires_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $get_public_jobs$
  select
    job.id,
    job.title,
    job.category,
    job.employment_type,
    job.description,
    job.responsibilities,
    job.requirements,
    job.emirate,
    job.city,
    case
      when job.show_exact_location then restaurant.address
      else job.approximate_location
    end as location,
    case when job.show_restaurant_name then restaurant.name else null end,
    job.salary_type,
    job.salary_min,
    job.salary_max,
    job.salary_currency::text,
    job.number_of_vacancies,
    job.experience_required,
    job.immediate_joining,
    job.preferred_joining_date,
    job.accommodation_provided,
    job.food_provided,
    job.visa_provided,
    job.working_hours,
    job.weekly_day_off,
    job.preferred_languages,
    job.contact_whatsapp,
    job.published_at,
    job.expires_at,
    count(*) over() as total_count
  from public.jobs job
  join public.restaurants restaurant on restaurant.id = job.restaurant_id
  where job.status = 'published'
    and job.expires_at > now()
    and restaurant.is_active = true
    and restaurant.status in ('live', 'trial', 'paid')
    and (requested_job_id is null or job.id = requested_job_id)
    and (
      nullif(trim(requested_search), '') is null
      or job.title ilike '%' || trim(requested_search) || '%'
      or job.category ilike '%' || trim(requested_search) || '%'
      or job.city ilike '%' || trim(requested_search) || '%'
    )
    and (nullif(trim(requested_emirate), '') is null or job.emirate = requested_emirate)
    and (nullif(trim(requested_city), '') is null or job.city = requested_city)
    and (nullif(trim(requested_category), '') is null or job.category = requested_category)
    and (requested_immediate_joining is null or job.immediate_joining = requested_immediate_joining)
    and (requested_accommodation is null or job.accommodation_provided = requested_accommodation)
  order by job.published_at desc
  limit least(greatest(coalesce(requested_limit, 12), 1), 50)
  offset greatest(coalesce(requested_offset, 0), 0);
$get_public_jobs$;

revoke all on function public.get_public_jobs(
  uuid, text, text, text, text, boolean, boolean, integer, integer
) from public;
grant execute on function public.get_public_jobs(
  uuid, text, text, text, text, boolean, boolean, integer, integer
) to anon, authenticated, service_role;

create or replace function public.record_public_job_event(
  requested_job_id uuid,
  requested_event_type text,
  requested_fingerprint text
)
returns void
language plpgsql
security definer
set search_path = public
as $record_public_job_event$
declare
  target_restaurant_id uuid;
begin
  if requested_event_type not in ('job_viewed', 'whatsapp_apply_clicked', 'job_shared') then
    raise exception 'Invalid job event';
  end if;
  if requested_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid event fingerprint';
  end if;

  select restaurant_id into target_restaurant_id
  from public.jobs
  where id = requested_job_id and status = 'published' and expires_at > now();

  if target_restaurant_id is null then
    raise exception 'Job not found';
  end if;

  -- Keep counters directional without letting reloads or simple click-spam
  -- inflate them. No raw IP or user-agent is retained.
  if exists (
    select 1 from public.job_events
    where job_id = requested_job_id
      and event_type = requested_event_type
      and visitor_fingerprint = requested_fingerprint
      and created_at > now() - interval '5 minutes'
  ) then
    return;
  end if;

  insert into public.job_events (
    restaurant_id, job_id, event_type, visitor_fingerprint
  ) values (
    target_restaurant_id, requested_job_id, requested_event_type, requested_fingerprint
  );

  if requested_event_type = 'whatsapp_apply_clicked' then
    update public.jobs
    set whatsapp_apply_clicks = whatsapp_apply_clicks + 1
    where id = requested_job_id and restaurant_id = target_restaurant_id;
  end if;
end;
$record_public_job_event$;

revoke all on function public.record_public_job_event(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.record_public_job_event(uuid, text, text)
to service_role;

create or replace function public.report_public_job(
  requested_job_id uuid,
  requested_reason text,
  requested_details text,
  requested_reporter_contact text,
  requested_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $report_public_job$
declare
  target_restaurant_id uuid;
  report_id uuid;
begin
  if requested_reason not in (
    'Fake job', 'Asking candidates for money', 'Misleading salary or details',
    'Duplicate listing', 'Inappropriate content', 'Job no longer available', 'Other'
  ) then
    raise exception 'Invalid report reason';
  end if;

  if char_length(coalesce(requested_details, '')) > 1000
    or char_length(coalesce(requested_reporter_contact, '')) > 160
    or requested_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid report';
  end if;

  select restaurant_id into target_restaurant_id
  from public.jobs
  where id = requested_job_id and status = 'published' and expires_at > now();

  if target_restaurant_id is null then
    raise exception 'Job not found';
  end if;

  if (
    select count(*) from public.job_reports
    where job_id = requested_job_id
      and reporter_fingerprint = requested_fingerprint
      and created_at > now() - interval '1 hour'
  ) >= 3 then
    raise exception 'Too many reports';
  end if;

  insert into public.job_reports (
    restaurant_id, job_id, reason, details, reporter_contact, reporter_fingerprint
  ) values (
    target_restaurant_id,
    requested_job_id,
    requested_reason,
    nullif(trim(requested_details), ''),
    nullif(trim(requested_reporter_contact), ''),
    requested_fingerprint
  ) returning id into report_id;

  return report_id;
end;
$report_public_job$;

revoke all on function public.report_public_job(uuid, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.report_public_job(uuid, text, text, text, text)
to service_role;

-- Fail migration if a browser role can mutate or inspect private report/event data.
do $verify_jobs_security$
begin
  if has_table_privilege('anon', 'public.jobs', 'select')
    or has_table_privilege('anon', 'public.jobs', 'insert')
    or has_table_privilege('authenticated', 'public.jobs', 'insert')
    or has_table_privilege('authenticated', 'public.jobs', 'update')
    or has_table_privilege('authenticated', 'public.jobs', 'delete')
    or has_table_privilege('anon', 'public.job_reports', 'select')
    or has_table_privilege('anon', 'public.job_events', 'select') then
    raise exception 'Jobs browser-role boundary is too broad';
  end if;
end;
$verify_jobs_security$;

notify pgrst, 'reload schema';
