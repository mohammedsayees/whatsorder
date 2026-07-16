-- Dashboard revamp: daily trend series for the admin dashboard chart.
--
-- get_restaurant_dashboard_trend returns, for one tenant:
--   * days             — one bucket per local calendar day in the requested
--                        range ('7d' | '30d' | 'mtd'), zero-filled, with the
--                        order count (all statuses, matching todaysOrders
--                        semantics in get_restaurant_dashboard_analytics) and
--                        completed sales total per day
--   * monthOrders /    — month-to-date totals in the restaurant's timezone,
--     monthSales         independent of the requested range
--   * inProgressOrders — orders currently between acceptance and completion
--                        (feeds the dashboard needs-attention strip)
--   * topItem /        — best-selling item across completed orders inside the
--     topItemQuantity    requested range (null topItem when no sales)
--
-- Service-role only, like the other dashboard aggregates: the dashboard is
-- rendered server-side behind requireRestaurantAdmin, so no anon/authenticated
-- execution is needed.

create or replace function public.get_restaurant_dashboard_trend(
  target_restaurant_id uuid,
  range_mode text default '7d'
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $dashboard_trend$
  with tenant as (
    select time_zone
    from public.restaurants
    where id = target_restaurant_id
  ),
  boundaries as (
    select
      tenant.time_zone,
      (now() at time zone tenant.time_zone)::date as today_local,
      case range_mode
        when '30d' then (now() at time zone tenant.time_zone)::date - 29
        when 'mtd' then date_trunc('month', now() at time zone tenant.time_zone)::date
        else (now() at time zone tenant.time_zone)::date - 6
      end as start_local,
      date_trunc('month', now() at time zone tenant.time_zone)
        at time zone tenant.time_zone as month_start
    from tenant
  ),
  window_orders as (
    select
      (orders.created_at at time zone boundaries.time_zone)::date as local_date,
      orders.status,
      coalesce(orders.total, 0) as total,
      orders.items
    from public.orders
    cross join boundaries
    where orders.restaurant_id = target_restaurant_id
      and orders.created_at >=
        (boundaries.start_local::timestamp at time zone boundaries.time_zone)
  ),
  day_series as (
    select
      generate_series(
        boundaries.start_local,
        boundaries.today_local,
        interval '1 day'
      )::date as local_date
    from boundaries
  ),
  day_metrics as (
    select
      day_series.local_date,
      count(window_orders.local_date)::integer as orders,
      coalesce(
        sum(window_orders.total) filter (where window_orders.status = 'Completed'),
        0
      ) as sales
    from day_series
    left join window_orders on window_orders.local_date = day_series.local_date
    group by day_series.local_date
  ),
  month_metrics as (
    select
      count(*)::integer as month_orders,
      coalesce(
        sum(orders.total) filter (where orders.status = 'Completed'),
        0
      ) as month_sales
    from public.orders
    cross join boundaries
    where orders.restaurant_id = target_restaurant_id
      and orders.created_at >= boundaries.month_start
  ),
  progress_metrics as (
    select count(*)::integer as in_progress_orders
    from public.orders
    where restaurant_id = target_restaurant_id
      and status in ('Accepted', 'Preparing', 'Ready to Serve', 'Out for Delivery')
  ),
  item_metrics as (
    select
      coalesce(item ->> 'name', 'Unknown item') as item_name,
      sum(coalesce((item ->> 'quantity')::integer, 0)) as quantity
    from window_orders,
      lateral jsonb_array_elements(window_orders.items) item
    where window_orders.status = 'Completed'
    group by coalesce(item ->> 'name', 'Unknown item')
    order by quantity desc, item_name
    limit 1
  )
  select jsonb_build_object(
    'days',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'date', to_char(day_metrics.local_date, 'YYYY-MM-DD'),
            'orders', day_metrics.orders,
            'sales', day_metrics.sales
          )
          order by day_metrics.local_date
        )
        from day_metrics
      ),
      '[]'::jsonb
    ),
    'monthOrders', month_metrics.month_orders,
    'monthSales', month_metrics.month_sales,
    'inProgressOrders', progress_metrics.in_progress_orders,
    'topItem', item_metrics.item_name,
    'topItemQuantity', coalesce(item_metrics.quantity, 0)
  )
  from month_metrics
  cross join progress_metrics
  left join item_metrics on true;
$dashboard_trend$;

revoke all on function public.get_restaurant_dashboard_trend(uuid, text)
from public, anon, authenticated;
grant execute on function public.get_restaurant_dashboard_trend(uuid, text)
to service_role;
