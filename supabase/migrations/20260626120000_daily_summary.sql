-- WhatsOrder: Daily Insight Job (BOH)
--
-- Once-a-day plain-language recap of yesterday's trading, sent to each café
-- owner. Numbers are 100% deterministic (computed here in SQL); an LLM only
-- narrates them. This migration is additive:
--   1. owner controls on restaurants (kill switch + optional alt phone)
--   2. an append-only run log (idempotency + observability)
--   3. daily_summary_numbers(): all metrics for one restaurant/day as jsonb
--
-- Writes to daily_summary_runs happen only through the service-role cron job;
-- authenticated JWT access is read-only and tenant-scoped (mirrors
-- order_status_events / order_payment_events).

-- 1. Owner controls -----------------------------------------------------------

alter table public.restaurants
  add column if not exists daily_summary_enabled boolean not null default true,
  add column if not exists daily_summary_phone   text;

-- 2. Append-only run log ------------------------------------------------------

create table if not exists public.daily_summary_runs (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  summary_date  date not null,                 -- the Asia/Dubai day reported
  status        text not null,                 -- 'sent' | 'skipped_empty' | 'failed'
  numbers       jsonb,                          -- the deterministic payload, for debugging
  message_text  text,
  error         text,
  created_at    timestamptz not null default now(),
  unique (restaurant_id, summary_date)          -- idempotency: reruns never double-send
);

create index if not exists idx_daily_summary_runs_restaurant_date
on public.daily_summary_runs(restaurant_id, summary_date desc);

alter table public.daily_summary_runs enable row level security;

drop policy if exists "Restaurant users can read own daily summary runs"
on public.daily_summary_runs;
create policy "Restaurant users can read own daily summary runs"
on public.daily_summary_runs for select
using (public.is_restaurant_member(daily_summary_runs.restaurant_id));

drop policy if exists "Super admins can read all daily summary runs"
on public.daily_summary_runs;
create policy "Super admins can read all daily summary runs"
on public.daily_summary_runs for select
using (public.is_super_admin());

revoke all on table public.daily_summary_runs from anon, authenticated;
grant select on table public.daily_summary_runs to authenticated;

-- 3. Deterministic metrics ----------------------------------------------------
--
-- All figures for one restaurant on one Asia/Dubai day. target_day defaults to
-- "yesterday" in Dubai local time but is parameterised so a known past day can
-- be spot-checked. Cancelled orders are excluded from counts/revenue; they are
-- surfaced separately as cancelled_count. Day boundaries are computed in local
-- time then resolved to UTC (Dubai is UTC+4, no DST).

create or replace function public.daily_summary_numbers(
  rid uuid,
  target_day date default ((now() at time zone 'Asia/Dubai')::date - 1)
)
returns jsonb
language sql
stable
as $$
with bounds as (
  select
    (target_day::timestamp)         at time zone 'Asia/Dubai' as day_start,
    ((target_day + 1)::timestamp)   at time zone 'Asia/Dubai' as day_end,
    ((target_day - 1)::timestamp)   at time zone 'Asia/Dubai' as prev_start,
    (target_day::timestamp)         at time zone 'Asia/Dubai' as prev_end,
    ((target_day - 7)::timestamp)   at time zone 'Asia/Dubai' as lw_start,
    ((target_day - 6)::timestamp)   at time zone 'Asia/Dubai' as lw_end
),
day_orders as (
  select o.id, o.total, o.items, o.created_at
  from public.orders o, bounds b
  where o.restaurant_id = rid
    and o.created_at >= b.day_start
    and o.created_at <  b.day_end
    and o.status <> 'Cancelled'
),
agg as (
  select
    count(*)::int                  as order_count,
    coalesce(sum(total), 0)        as gross_revenue,
    coalesce(avg(total), 0)        as avg_order_value
  from day_orders
),
cancelled as (
  select count(*)::int as cancelled_count
  from public.orders o, bounds b
  where o.restaurant_id = rid
    and o.created_at >= b.day_start and o.created_at < b.day_end
    and o.status = 'Cancelled'
),
prev as (
  select count(*)::int as c
  from public.orders o, bounds b
  where o.restaurant_id = rid
    and o.created_at >= b.prev_start and o.created_at < b.prev_end
    and o.status <> 'Cancelled'
),
lastweek as (
  select count(*)::int as c
  from public.orders o, bounds b
  where o.restaurant_id = rid
    and o.created_at >= b.lw_start and o.created_at < b.lw_end
    and o.status <> 'Cancelled'
),
line_items as (
  select d.id, it->>'name' as name, (it->>'quantity')::numeric as quantity
  from day_orders d, jsonb_array_elements(d.items) it
  where it->>'name' is not null and it->>'name' <> ''
),
item_totals as (
  select name, sum(quantity) as qty
  from line_items
  group by name
),
top_item as (
  select name, qty from item_totals order by qty desc, name limit 1
),
combos as (
  select a.name as a, b.name as b, count(*)::int as together
  from line_items a
  join line_items b on a.id = b.id and a.name < b.name
  group by a.name, b.name
  order by together desc, a, b
  limit 1
),
hours as (
  select extract(hour from (created_at at time zone 'Asia/Dubai'))::int as hr, count(*)::int as c
  from day_orders
  group by 1
),
busy as (select hr from hours order by c desc, hr limit 1),
dead as (select hr from hours order by c asc, hr limit 1)
select jsonb_build_object(
  'summary_date',       target_day,
  'order_count',        (select order_count from agg),
  'gross_revenue',      round((select gross_revenue from agg), 2),
  'avg_order_value',    round((select avg_order_value from agg), 2),
  'prev_count',         (select c from prev),
  'last_week_count',    (select c from lastweek),
  'delta_vs_prev',      (select order_count from agg) - (select c from prev),
  'delta_vs_last_week', (select order_count from agg) - (select c from lastweek),
  'cancelled_count',    (select cancelled_count from cancelled),
  'top_item',           (select case when name is not null
                            then jsonb_build_object('name', name, 'qty', qty) end from top_item),
  'top_combo',          (select case when a is not null
                            then jsonb_build_object('a', a, 'b', b, 'count', together) end from combos),
  'busiest_hour',       (select hr from busy),
  'deadest_hour',       (select hr from dead)
);
$$;

-- Locked to the service-role cron job; never callable by anon/authenticated.
revoke all on function public.daily_summary_numbers(uuid, date) from public;
grant execute on function public.daily_summary_numbers(uuid, date) to service_role;

notify pgrst, 'reload schema';
