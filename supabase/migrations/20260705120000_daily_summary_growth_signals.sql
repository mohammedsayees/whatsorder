-- Daily summary: add growth-insight signals to daily_summary_numbers.
--
-- Everything here is computed from orders + their JSONB line items, so it is
-- reliable for EVERY order regardless of whether the customer identified
-- themselves. New signals:
--   * dow_avg_count       — same-weekday 4-week average, so "slow day" means
--                           genuinely slow for that weekday, not just vs a freak
--                           prior day.
--   * item_riser/faller   — biggest week-over-week menu movers (promote / retire).
--   * aov_this_week/prev  — 7-day basket-size trend (shrinking baskets = upsell).
--   * contact_capture_rate— share of orders that left a phone number.
--   * marketable_count    — orders reachable for marketing (phone + consent),
--                           so any "message them" suggestion respects PDPL consent.
--
-- Lookbacks are bounded to 4 weeks and every window is scoped to `rid` on
-- (restaurant_id, created_at); this stays a cheap once-a-day batch query.

CREATE OR REPLACE FUNCTION public.daily_summary_numbers(rid uuid, target_day date DEFAULT (((now() AT TIME ZONE 'Asia/Dubai'::text))::date - 1))
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with bounds as (
  select
    (target_day::timestamp)         at time zone 'Asia/Dubai' as day_start,
    ((target_day + 1)::timestamp)   at time zone 'Asia/Dubai' as day_end,
    ((target_day - 1)::timestamp)   at time zone 'Asia/Dubai' as prev_start,
    (target_day::timestamp)         at time zone 'Asia/Dubai' as prev_end,
    ((target_day - 7)::timestamp)   at time zone 'Asia/Dubai' as lw_start,
    ((target_day - 6)::timestamp)   at time zone 'Asia/Dubai' as lw_end,
    ((target_day - 6)::timestamp)   at time zone 'Asia/Dubai' as tw_start,
    ((target_day + 1)::timestamp)   at time zone 'Asia/Dubai' as tw_end,
    ((target_day - 13)::timestamp)  at time zone 'Asia/Dubai' as pw_start,
    ((target_day - 6)::timestamp)   at time zone 'Asia/Dubai' as pw_end
),
day_orders as (
  select o.id, o.total, o.items, o.created_at, o.customer_phone, o.consent_marketing
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
contact as (
  select
    count(*) filter (
      where customer_phone is not null and customer_phone <> ''
    )::int as contact_count,
    count(*) filter (
      where customer_phone is not null and customer_phone <> '' and consent_marketing is true
    )::int as marketable_count
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
dow as (
  -- Average order count on the same weekday over the previous 4 weeks.
  select coalesce(round(avg(c), 1), 0) as dow_avg_count
  from (
    select (
      select count(*)::int from public.orders o
      where o.restaurant_id = rid
        and o.created_at >= (gs::date::timestamp at time zone 'Asia/Dubai')
        and o.created_at <  ((gs::date + 1)::timestamp at time zone 'Asia/Dubai')
        and o.status <> 'Cancelled'
    ) as c
    from generate_series((target_day - 28)::timestamp, (target_day - 7)::timestamp, interval '7 days') gs
  ) weekdays
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
dead as (select hr from hours order by c asc, hr limit 1),
tw_orders as (
  select o.id, o.items, o.total
  from public.orders o, bounds b
  where o.restaurant_id = rid
    and o.created_at >= b.tw_start and o.created_at < b.tw_end
    and o.status <> 'Cancelled'
),
pw_orders as (
  select o.id, o.items, o.total
  from public.orders o, bounds b
  where o.restaurant_id = rid
    and o.created_at >= b.pw_start and o.created_at < b.pw_end
    and o.status <> 'Cancelled'
),
tw_items as (
  select it->>'name' as name, sum((it->>'quantity')::numeric) as qty
  from tw_orders t, jsonb_array_elements(t.items) it
  where it->>'name' is not null and it->>'name' <> ''
  group by 1
),
pw_items as (
  select it->>'name' as name, sum((it->>'quantity')::numeric) as qty
  from pw_orders p, jsonb_array_elements(p.items) it
  where it->>'name' is not null and it->>'name' <> ''
  group by 1
),
movers as (
  select
    coalesce(tw.name, pw.name)                    as name,
    coalesce(tw.qty, 0)                           as this_week,
    coalesce(pw.qty, 0)                           as prev_week,
    coalesce(tw.qty, 0) - coalesce(pw.qty, 0)     as delta
  from tw_items tw
  full outer join pw_items pw on tw.name = pw.name
),
riser as (
  select name, this_week, prev_week from movers where delta > 0 order by delta desc, name limit 1
),
faller as (
  select name, this_week, prev_week from movers where delta < 0 order by delta asc, name limit 1
),
tw_aov as (select coalesce(round(avg(total), 2), 0) as v from tw_orders),
pw_aov as (select coalesce(round(avg(total), 2), 0) as v from pw_orders)
select jsonb_build_object(
  'summary_date',        target_day,
  'order_count',         (select order_count from agg),
  'gross_revenue',       round((select gross_revenue from agg), 2),
  'avg_order_value',     round((select avg_order_value from agg), 2),
  'prev_count',          (select c from prev),
  'last_week_count',     (select c from lastweek),
  'delta_vs_prev',       (select order_count from agg) - (select c from prev),
  'delta_vs_last_week',  (select order_count from agg) - (select c from lastweek),
  'dow_avg_count',       (select dow_avg_count from dow),
  'cancelled_count',     (select cancelled_count from cancelled),
  'contact_capture_rate',round((select contact_count from contact)::numeric
                            / nullif((select order_count from agg), 0), 2),
  'marketable_count',    (select marketable_count from contact),
  'top_item',            (select case when name is not null
                            then jsonb_build_object('name', name, 'qty', qty) end from top_item),
  'top_combo',           (select case when a is not null
                            then jsonb_build_object('a', a, 'b', b, 'count', together) end from combos),
  'item_riser',          (select case when name is not null
                            then jsonb_build_object('name', name, 'this_week', this_week, 'prev_week', prev_week) end from riser),
  'item_faller',         (select case when name is not null
                            then jsonb_build_object('name', name, 'this_week', this_week, 'prev_week', prev_week) end from faller),
  'aov_this_week',       (select v from tw_aov),
  'aov_prev_week',       (select v from pw_aov),
  'busiest_hour',        (select hr from busy),
  'deadest_hour',        (select hr from dead)
);
$function$;
