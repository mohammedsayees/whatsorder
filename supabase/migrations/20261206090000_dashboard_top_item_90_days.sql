-- Dashboard analytics: limit "topSellingItem" to the last 90 days.
--
-- Before: the top item was computed by unpacking the `items` jsonb of every
-- completed order the restaurant has ever had, so the dashboard query grew
-- with all-time history (it was the largest part of
-- get_admin_dashboard_snapshot). Product decision: the top item now means
-- "best seller over the last 90 days" (rolling, by order created_at).
--
-- Everything else in the function is copied verbatim from the live
-- definition (last changed in 20260714151000_multi_country_operational_time.sql);
-- only the item_metrics filter is new. Same signature, return shape,
-- SECURITY DEFINER and search_path, so existing grants are kept.
-- The demo-data fallback (getAnalytics in src/lib/data.ts) applies the same
-- 90-day window.

create or replace function public.get_restaurant_dashboard_analytics(
  target_restaurant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with tenant as (
    select time_zone
    from public.restaurants
    where id = target_restaurant_id
  ),
  boundaries as (
    select
      date_trunc('day', now() at time zone tenant.time_zone)
        at time zone tenant.time_zone as today_start,
      (date_trunc('day', now() at time zone tenant.time_zone) + interval '1 day')
        at time zone tenant.time_zone as tomorrow_start
    from tenant
  ),
  order_metrics as (
    select
      count(*) filter (
        where orders.created_at >= boundaries.today_start
          and orders.created_at < boundaries.tomorrow_start
      )::integer as todays_orders,
      coalesce(sum(orders.total) filter (
        where orders.status = 'Completed'
          and orders.created_at >= boundaries.today_start
          and orders.created_at < boundaries.tomorrow_start
      ), 0) as todays_revenue,
      count(*) filter (where orders.status = 'New')::integer as new_orders,
      count(*) filter (where orders.status = 'Completed')::integer as completed_orders,
      coalesce(avg(orders.total) filter (where orders.status = 'Completed'), 0)
        as average_order_value
    from public.orders
    cross join boundaries
    where orders.restaurant_id = target_restaurant_id
  ),
  repeat_metrics as (
    select count(*)::integer as repeat_customers
    from public.customers
    where restaurant_id = target_restaurant_id
      and total_orders > 1
  ),
  item_metrics as (
    select
      coalesce(item ->> 'name', 'Unknown item') as item_name,
      sum(coalesce((item ->> 'quantity')::integer, 0)) as quantity
    from public.orders,
      lateral jsonb_array_elements(orders.items) item
    where orders.restaurant_id = target_restaurant_id
      and orders.status = 'Completed'
      -- New: rolling 90-day window (uses idx_orders_restaurant_status_created).
      and orders.created_at >= now() - interval '90 days'
    group by coalesce(item ->> 'name', 'Unknown item')
    order by quantity desc, item_name
    limit 1
  )
  select jsonb_build_object(
    'todaysOrders', order_metrics.todays_orders,
    'todaysRevenue', order_metrics.todays_revenue,
    'newOrders', order_metrics.new_orders,
    'completedOrders', order_metrics.completed_orders,
    'repeatCustomers', repeat_metrics.repeat_customers,
    'averageOrderValue', order_metrics.average_order_value,
    'topSellingItem', coalesce(item_metrics.item_name, 'No sales yet')
  )
  from order_metrics
  cross join repeat_metrics
  left join item_metrics on true;
$function$;
