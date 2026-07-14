-- Daily Coach deterministic insight payload.
--
-- One service-role-only, tenant-scoped query returns completed-sales facts for
-- six local trading periods, four same-weekday baselines, consent-aware customer
-- signals, and privacy-thresholded delivery-area aggregates. Narrative and
-- recommendation wording remains an application concern; the database is the
-- only source of figures.

create or replace function public.daily_coach_insights(
  rid uuid,
  target_day date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $daily_coach$
with tenant as (
  select time_zone
  from public.restaurants
  where id = rid
),
bounds as (
  select
    target_day::timestamp at time zone tenant.time_zone as day_start,
    (target_day + 1)::timestamp at time zone tenant.time_zone as day_end,
    (target_day - 1)::timestamp at time zone tenant.time_zone as previous_start,
    target_day::timestamp at time zone tenant.time_zone as previous_end,
    (target_day - 28)::timestamp at time zone tenant.time_zone as history_start,
    tenant.time_zone
  from tenant
),
periods(period_key, label, start_hour, end_hour, display_order) as (
  values
    ('early_morning', 'Early morning', 4, 7, 1),
    ('morning',       'Morning',       7, 11, 2),
    ('lunch',         'Lunch',         11, 15, 3),
    ('evening',       'Evening',       15, 19, 4),
    ('night',         'Night',         19, 24, 5),
    ('midnight',      'Midnight',      0, 4, 6)
),
current_orders as (
  select
    o.*,
    extract(hour from o.created_at at time zone b.time_zone)::integer as local_hour,
    (
      nullif(trim(o.customer_phone), '') is not null
      and exists (
        select 1
        from public.orders previous_order
        where previous_order.restaurant_id = rid
          and previous_order.status = 'Completed'
          and previous_order.customer_phone = o.customer_phone
          and previous_order.created_at < b.day_start
      )
    ) as is_repeat_customer
  from public.orders o
  cross join bounds b
  where o.restaurant_id = rid
    and o.status = 'Completed'
    and o.created_at >= b.day_start
    and o.created_at < b.day_end
),
current_tagged as (
  select
    current_orders.*,
    periods.period_key
  from current_orders
  join periods
    on current_orders.local_hour >= periods.start_hour
   and current_orders.local_hour < periods.end_hour
),
cancelled_tagged as (
  select periods.period_key, count(*)::integer as cancelled_count
  from public.orders o
  cross join bounds b
  join periods
    on extract(hour from o.created_at at time zone b.time_zone) >= periods.start_hour
   and extract(hour from o.created_at at time zone b.time_zone) < periods.end_hour
  where o.restaurant_id = rid
    and o.status = 'Cancelled'
    and o.created_at >= b.day_start
    and o.created_at < b.day_end
  group by periods.period_key
),
comparison_days as (
  select (target_day - (week_number * 7))::date as comparison_day
  from generate_series(1, 4) week_number
),
historical_tagged as (
  select
    (o.created_at at time zone b.time_zone)::date as local_day,
    periods.period_key,
    o.total
  from public.orders o
  cross join bounds b
  join periods
    on extract(hour from o.created_at at time zone b.time_zone) >= periods.start_hour
   and extract(hour from o.created_at at time zone b.time_zone) < periods.end_hour
  where o.restaurant_id = rid
    and o.status = 'Completed'
    and o.created_at >= b.history_start
    and o.created_at < b.day_start
    and (o.created_at at time zone b.time_zone)::date in (
      select comparison_day from comparison_days
    )
),
historical_day_period as (
  select
    periods.period_key,
    comparison_days.comparison_day,
    count(historical_tagged.total)::integer as order_count,
    coalesce(sum(historical_tagged.total), 0)::numeric as sales
  from periods
  cross join comparison_days
  left join historical_tagged
    on historical_tagged.period_key = periods.period_key
   and historical_tagged.local_day = comparison_days.comparison_day
  group by periods.period_key, comparison_days.comparison_day
),
period_baselines as (
  select
    period_key,
    round(avg(order_count), 1) as baseline_order_count,
    round(
      sum(sales) / nullif(sum(order_count), 0),
      2
    ) as baseline_avg_order_value
  from historical_day_period
  group by period_key
),
period_metrics as (
  select
    periods.period_key,
    periods.label,
    periods.start_hour,
    periods.end_hour,
    periods.display_order,
    count(current_tagged.id)::integer as order_count,
    coalesce(sum(current_tagged.total), 0)::numeric(12, 2) as sales,
    coalesce(avg(current_tagged.total), 0)::numeric(12, 2) as avg_order_value,
    coalesce(period_baselines.baseline_order_count, 0) as baseline_order_count,
    coalesce(period_baselines.baseline_avg_order_value, 0) as baseline_avg_order_value,
    count(current_tagged.id) filter (
      where nullif(trim(current_tagged.customer_phone), '') is not null
    )::integer as contact_count,
    count(current_tagged.id) filter (
      where nullif(trim(current_tagged.customer_phone), '') is not null
        and current_tagged.consent_marketing is true
    )::integer as marketable_count,
    count(current_tagged.id) filter (
      where current_tagged.is_repeat_customer
    )::integer as repeat_customer_orders,
    count(current_tagged.id) filter (
      where nullif(trim(current_tagged.customer_phone), '') is not null
        and not current_tagged.is_repeat_customer
    )::integer as new_customer_orders,
    count(current_tagged.id) filter (
      where current_tagged.fulfilment_type = 'delivery'
    )::integer as delivery_order_count
  from periods
  left join current_tagged on current_tagged.period_key = periods.period_key
  left join period_baselines on period_baselines.period_key = periods.period_key
  group by
    periods.period_key,
    periods.label,
    periods.start_hour,
    periods.end_hour,
    periods.display_order,
    period_baselines.baseline_order_count,
    period_baselines.baseline_avg_order_value
),
period_fulfilment as (
  select
    period_key,
    jsonb_object_agg(
      fulfilment_type,
      jsonb_build_object('orders', order_count, 'sales', sales)
    ) as breakdown
  from (
    select
      period_key,
      fulfilment_type,
      count(*)::integer as order_count,
      sum(total)::numeric(12, 2) as sales
    from current_tagged
    group by period_key, fulfilment_type
  ) grouped
  group by period_key
),
period_items as (
  select
    current_tagged.period_key,
    item ->> 'name' as item_name,
    sum(coalesce((item ->> 'quantity')::numeric, 0)) as quantity
  from current_tagged
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(current_tagged.items::jsonb) = 'array'
        then current_tagged.items::jsonb
      else '[]'::jsonb
    end
  ) item
  where nullif(trim(item ->> 'name'), '') is not null
  group by current_tagged.period_key, item ->> 'name'
),
period_top_items as (
  select distinct on (period_key)
    period_key,
    item_name,
    quantity
  from period_items
  order by period_key, quantity desc, item_name
),
period_area_counts as (
  select
    period_key,
    trim(delivery_area) as area,
    count(*)::integer as order_count,
    sum(total)::numeric(12, 2) as sales
  from current_tagged
  where fulfilment_type = 'delivery'
    and nullif(trim(delivery_area), '') is not null
  group by period_key, trim(delivery_area)
  having count(*) >= 3
),
period_top_areas as (
  select distinct on (period_key)
    period_key,
    area,
    order_count,
    sales
  from period_area_counts
  order by period_key, order_count desc, sales desc, area
),
overall as (
  select
    count(*)::integer as completed_order_count,
    coalesce(sum(total), 0)::numeric(12, 2) as completed_sales,
    coalesce(avg(total), 0)::numeric(12, 2) as avg_order_value,
    count(*) filter (
      where nullif(trim(customer_phone), '') is not null
    )::integer as contact_count,
    count(*) filter (
      where nullif(trim(customer_phone), '') is not null
        and consent_marketing is true
    )::integer as marketable_count,
    count(*) filter (where is_repeat_customer)::integer as repeat_customer_orders,
    count(*) filter (
      where nullif(trim(customer_phone), '') is not null
        and not is_repeat_customer
    )::integer as new_customer_orders
  from current_orders
),
previous_day as (
  select count(*)::integer as order_count
  from public.orders o
  cross join bounds b
  where o.restaurant_id = rid
    and o.status = 'Completed'
    and o.created_at >= b.previous_start
    and o.created_at < b.previous_end
),
same_weekday as (
  select
    round(avg(order_count), 1) as average_order_count,
    max(order_count) filter (
      where comparison_day = target_day - 7
    )::integer as last_week_count
  from historical_day_period
  where period_key = 'early_morning'
),
comparison_totals as (
  select
    comparison_day,
    sum(order_count)::integer as order_count
  from historical_day_period
  group by comparison_day
),
comparison_summary as (
  select
    round(avg(order_count), 1) as average_order_count,
    coalesce(max(order_count) filter (
      where comparison_day = target_day - 7
    ), 0)::integer as last_week_count
  from comparison_totals
),
cancelled_overall as (
  select count(*)::integer as cancelled_count
  from public.orders o
  cross join bounds b
  where o.restaurant_id = rid
    and o.status = 'Cancelled'
    and o.created_at >= b.day_start
    and o.created_at < b.day_end
),
location_areas as (
  select
    trim(delivery_area) as area,
    count(*)::integer as order_count,
    sum(total)::numeric(12, 2) as sales,
    avg(total)::numeric(12, 2) as avg_order_value,
    count(*) filter (where is_repeat_customer)::integer as repeat_customer_orders
  from current_orders
  where fulfilment_type = 'delivery'
    and nullif(trim(delivery_area), '') is not null
  group by trim(delivery_area)
  having count(*) >= 3
  order by order_count desc, sales desc, area
  limit 3
)
select jsonb_build_object(
  'summary_date', target_day,
  'completed_order_count', overall.completed_order_count,
  'completed_sales', overall.completed_sales,
  'avg_order_value', overall.avg_order_value,
  'previous_day_count', previous_day.order_count,
  'last_week_count', comparison_summary.last_week_count,
  'same_weekday_average', comparison_summary.average_order_count,
  'cancelled_count', cancelled_overall.cancelled_count,
  'contact_count', overall.contact_count,
  'marketable_count', overall.marketable_count,
  'repeat_customer_orders', overall.repeat_customer_orders,
  'new_customer_orders', overall.new_customer_orders,
  'periods', (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'key', metrics.period_key,
          'label', metrics.label,
          'start_hour', metrics.start_hour,
          'end_hour', metrics.end_hour,
          'order_count', metrics.order_count,
          'sales', metrics.sales,
          'avg_order_value', metrics.avg_order_value,
          'baseline_order_count', metrics.baseline_order_count,
          'baseline_avg_order_value', metrics.baseline_avg_order_value,
          'cancelled_count', coalesce(cancelled.cancelled_count, 0),
          'contact_count', metrics.contact_count,
          'marketable_count', metrics.marketable_count,
          'repeat_customer_orders', metrics.repeat_customer_orders,
          'new_customer_orders', metrics.new_customer_orders,
          'delivery_order_count', metrics.delivery_order_count,
          'fulfilment_breakdown', coalesce(fulfilment.breakdown, '{}'::jsonb),
          'top_item', case
            when top_item.item_name is null then null
            else jsonb_build_object(
              'name', top_item.item_name,
              'qty', top_item.quantity
            )
          end,
          'top_delivery_area', case
            when top_area.area is null then null
            else jsonb_build_object(
              'area', top_area.area,
              'orders', top_area.order_count,
              'sales', top_area.sales
            )
          end
        )
        order by metrics.display_order
      ),
      '[]'::jsonb
    )
    from period_metrics metrics
    left join cancelled_tagged cancelled
      on cancelled.period_key = metrics.period_key
    left join period_fulfilment fulfilment
      on fulfilment.period_key = metrics.period_key
    left join period_top_items top_item
      on top_item.period_key = metrics.period_key
    left join period_top_areas top_area
      on top_area.period_key = metrics.period_key
  ),
  'location_insights', (
    select coalesce(jsonb_agg(to_jsonb(location_areas)), '[]'::jsonb)
    from location_areas
  )
)
from overall
cross join previous_day
cross join comparison_summary
cross join cancelled_overall;
$daily_coach$;

revoke all on function public.daily_coach_insights(uuid, date)
from public, anon, authenticated;
grant execute on function public.daily_coach_insights(uuid, date)
to service_role;

notify pgrst, 'reload schema';
