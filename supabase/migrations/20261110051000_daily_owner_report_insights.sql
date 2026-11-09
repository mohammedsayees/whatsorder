-- Reliable owner-report facts that are not part of the period coaching RPC.
-- This function remains service-role-only and explicitly scoped to one tenant.

create or replace function public.daily_owner_report_insights(
  rid uuid,
  target_day date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $daily_owner_report$
with tenant as (
  select time_zone
  from public.restaurants
  where id = rid
),
bounds as (
  select
    target_day::timestamp at time zone tenant.time_zone as day_start,
    (target_day + 1)::timestamp at time zone tenant.time_zone as day_end
  from tenant
),
current_orders as (
  select o.items, o.payment_method, o.total
  from public.orders o
  cross join bounds b
  where o.restaurant_id = rid
    and o.status = 'Completed'
    and o.created_at >= b.day_start
    and o.created_at < b.day_end
),
item_totals as (
  select
    trim(item ->> 'name') as name,
    sum(coalesce((item ->> 'quantity')::numeric, 0)) as qty
  from current_orders
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(current_orders.items::jsonb) = 'array'
        then current_orders.items::jsonb
      else '[]'::jsonb
    end
  ) item
  where nullif(trim(item ->> 'name'), '') is not null
  group by trim(item ->> 'name')
),
top_items as (
  select name, qty
  from item_totals
  order by qty desc, name
  limit 3
),
payment_totals as (
  select
    coalesce(payment_method::text, 'Unrecorded') as payment_method,
    count(*)::integer as order_count,
    coalesce(sum(total), 0)::numeric(12, 2) as sales
  from current_orders
  group by coalesce(payment_method::text, 'Unrecorded')
)
select jsonb_build_object(
  'top_items', (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('name', name, 'qty', qty)
        order by qty desc, name
      ),
      '[]'::jsonb
    )
    from top_items
  ),
  'payment_breakdown', (
    select coalesce(
      jsonb_object_agg(
        payment_method,
        jsonb_build_object('orders', order_count, 'sales', sales)
      ),
      '{}'::jsonb
    )
    from payment_totals
  )
);
$daily_owner_report$;

revoke all on function public.daily_owner_report_insights(uuid, date)
from public, anon, authenticated;
grant execute on function public.daily_owner_report_insights(uuid, date)
to service_role;

notify pgrst, 'reload schema';
