-- Multiple tenant-scoped owner recipients for the Daily Coach WhatsApp recap.
-- The legacy single-number columns remain as a compatibility fallback while
-- application instances roll forward.

alter table public.restaurants
  add column if not exists daily_summary_phones text[] not null default '{}'::text[];

alter table public.restaurants
  drop constraint if exists restaurants_daily_summary_phones_max;
alter table public.restaurants
  add constraint restaurants_daily_summary_phones_max
  check (cardinality(daily_summary_phones) <= 5);

update public.restaurants
set daily_summary_phones = array[coalesce(daily_summary_phone, owner_phone)]
where cardinality(daily_summary_phones) = 0
  and coalesce(daily_summary_phone, owner_phone) is not null
  and trim(coalesce(daily_summary_phone, owner_phone)) <> '';

alter table public.daily_summary_runs
  add column if not exists delivery_results jsonb;

comment on column public.restaurants.daily_summary_phones is
  'Up to five normalized WhatsApp recipients for this tenant daily recap.';
comment on column public.daily_summary_runs.delivery_results is
  'Per-recipient transport acceptance results for the tenant daily recap.';

notify pgrst, 'reload schema';
