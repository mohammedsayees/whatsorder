-- Make database-side operational boundaries use each tenant's constrained IANA
-- timezone. Application checks already do this; these functions preserve the
-- same rule at the transactional/reporting boundary.

create or replace function public.is_restaurant_open_at(
  schedule_enabled boolean,
  schedule jsonb,
  restaurant_time_zone text,
  checked_at timestamptz default now()
)
returns boolean
language plpgsql
stable
set search_path = public
as $restaurant_open$
declare
  day_keys text[] := array[
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  ];
  local_time timestamp := checked_at at time zone restaurant_time_zone;
  day_index integer := extract(isodow from local_time)::integer;
  current_minutes integer :=
    extract(hour from local_time)::integer * 60 + extract(minute from local_time)::integer;
  current_day jsonb;
  previous_day jsonb;
  opens integer;
  closes integer;
begin
  if schedule_enabled is not true then
    return true;
  end if;

  if restaurant_time_zone not in ('Asia/Dubai', 'Asia/Kolkata') then
    return false;
  end if;

  current_day := coalesce(schedule -> day_keys[day_index], '{}'::jsonb);
  if coalesce((current_day ->> 'closed')::boolean, true) is false then
    opens := split_part(current_day ->> 'open', ':', 1)::integer * 60
      + split_part(current_day ->> 'open', ':', 2)::integer;
    closes := split_part(current_day ->> 'close', ':', 1)::integer * 60
      + split_part(current_day ->> 'close', ':', 2)::integer;

    if opens = closes
       or (closes > opens and current_minutes >= opens and current_minutes < closes)
       or (closes < opens and current_minutes >= opens) then
      return true;
    end if;
  end if;

  previous_day := coalesce(
    schedule -> day_keys[case when day_index = 1 then 7 else day_index - 1 end],
    '{}'::jsonb
  );
  if coalesce((previous_day ->> 'closed')::boolean, true) is false then
    opens := split_part(previous_day ->> 'open', ':', 1)::integer * 60
      + split_part(previous_day ->> 'open', ':', 2)::integer;
    closes := split_part(previous_day ->> 'close', ':', 1)::integer * 60
      + split_part(previous_day ->> 'close', ':', 2)::integer;

    if closes < opens and current_minutes < closes then
      return true;
    end if;
  end if;

  return false;
exception
  when others then
    return false;
end;
$restaurant_open$;

revoke all on function public.is_restaurant_open_at(boolean, jsonb, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.is_restaurant_open_at(boolean, jsonb, text, timestamptz)
to service_role;

create or replace function public.create_order_with_customer_v3(
  target_restaurant_id uuid,
  order_customer_name text,
  order_customer_phone text,
  order_fulfilment_type text,
  order_car_plate_number text,
  order_car_description text,
  order_table_number text,
  order_delivery_area text,
  order_delivery_address text,
  order_delivery_latitude numeric,
  order_delivery_longitude numeric,
  order_delivery_google_maps_url text,
  order_delivery_place_id text,
  order_delivery_address_text text,
  order_delivery_landmark text,
  order_notes text,
  order_payment_method text,
  order_items jsonb,
  order_subtotal numeric,
  order_delivery_fee numeric,
  order_total numeric,
  order_whatsapp_message text,
  order_consent_processing boolean,
  order_consent_marketing boolean,
  order_consent_timestamp timestamptz,
  order_submission_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_order_v3$
declare
  key_id uuid;
  existing_order_id uuid;
  new_order_id uuid;
begin
  if nullif(trim(order_submission_token), '') is null
     or length(order_submission_token) > 100 then
    raise exception 'A valid order submission token is required';
  end if;

  if not exists (
    select 1
    from public.restaurants
    where id = target_restaurant_id
      and is_active = true
      and accepting_orders = true
      and public.is_restaurant_open_at(
        opening_hours_enabled,
        opening_hours,
        time_zone
      )
      and status in ('live', 'trial', 'paid')
  ) then
    raise exception 'Restaurant is not accepting orders';
  end if;

  insert into public.order_submission_keys (restaurant_id, submission_token)
  values (target_restaurant_id, order_submission_token)
  on conflict (restaurant_id, submission_token) do nothing
  returning id into key_id;

  if key_id is null then
    select order_id
    into existing_order_id
    from public.order_submission_keys
    where restaurant_id = target_restaurant_id
      and submission_token = order_submission_token;

    if existing_order_id is not null then
      return existing_order_id;
    end if;

    raise exception 'This order submission is already being processed';
  end if;

  new_order_id := public.create_order_with_customer_v2(
    target_restaurant_id,
    order_customer_name,
    order_customer_phone,
    order_fulfilment_type,
    order_car_plate_number,
    order_car_description,
    order_table_number,
    order_delivery_area,
    order_delivery_address,
    order_delivery_latitude,
    order_delivery_longitude,
    order_delivery_google_maps_url,
    order_delivery_place_id,
    order_delivery_address_text,
    order_delivery_landmark,
    order_notes,
    order_payment_method,
    order_items,
    order_subtotal,
    order_delivery_fee,
    order_total,
    order_whatsapp_message,
    order_consent_processing,
    order_consent_marketing,
    order_consent_timestamp
  );

  update public.order_submission_keys
  set order_id = new_order_id
  where id = key_id;

  update public.customers customer
  set
    total_orders = (
      select count(*)::integer
      from public.orders order_row
      where order_row.restaurant_id = customer.restaurant_id
        and order_row.customer_phone = customer.phone
        and order_row.status = 'Completed'
    ),
    total_spend = coalesce((
      select sum(order_row.total)
      from public.orders order_row
      where order_row.restaurant_id = customer.restaurant_id
        and order_row.customer_phone = customer.phone
        and order_row.status = 'Completed'
    ), 0),
    last_order_at = (
      select max(order_row.created_at)
      from public.orders order_row
      where order_row.restaurant_id = customer.restaurant_id
        and order_row.customer_phone = customer.phone
        and order_row.status = 'Completed'
    )
  where customer.restaurant_id = target_restaurant_id
    and customer.phone = order_customer_phone;

  return new_order_id;
end;
$create_order_v3$;

revoke all on function public.create_order_with_customer_v3(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, text,
  text, text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.create_order_with_customer_v3(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, text,
  text, text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz, text
) to service_role;

create or replace function public.get_restaurant_dashboard_analytics(
  target_restaurant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $dashboard_analytics$
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
$dashboard_analytics$;

revoke all on function public.get_restaurant_dashboard_analytics(uuid)
from public, anon, authenticated;
grant execute on function public.get_restaurant_dashboard_analytics(uuid)
to service_role;

create or replace function public.get_restaurant_commission_kept(
  target_restaurant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $commission_kept$
  with tenant as (
    select time_zone
    from public.restaurants
    where id = target_restaurant_id
  ),
  boundaries as (
    select
      date_trunc('month', now() at time zone tenant.time_zone)
        at time zone tenant.time_zone as month_start
    from tenant
  ),
  delivery_orders as (
    select orders.created_at, coalesce(orders.subtotal, 0) as base
    from public.orders
    where orders.restaurant_id = target_restaurant_id
      and orders.fulfilment_type = 'delivery'
      and orders.status = 'Completed'
  ),
  metrics as (
    select
      count(*) filter (
        where delivery_orders.created_at >= boundaries.month_start
      )::integer as month_orders,
      coalesce(sum(delivery_orders.base) filter (
        where delivery_orders.created_at >= boundaries.month_start
      ), 0) as month_base,
      count(*)::integer as all_time_orders,
      coalesce(sum(delivery_orders.base), 0) as all_time_base
    from delivery_orders
    cross join boundaries
  )
  select jsonb_build_object(
    'monthOrders', metrics.month_orders,
    'monthBase', metrics.month_base,
    'allTimeOrders', metrics.all_time_orders,
    'allTimeBase', metrics.all_time_base
  )
  from metrics;
$commission_kept$;

revoke all on function public.get_restaurant_commission_kept(uuid)
from public, anon, authenticated;
grant execute on function public.get_restaurant_commission_kept(uuid)
to service_role;

-- Recreate the current daily-summary definition with the tenant timezone
-- expression. pg_get_functiondef preserves all later feature additions while
-- replacing only the former Dubai literal.
do $localize_existing_operational_functions$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.daily_summary_numbers(uuid,date)'::regprocedure
  ) into definition;
  -- The application always supplies target_day. A parameter default cannot
  -- safely query the preceding restaurant id, so retain a neutral UTC fallback
  -- only for legacy one-argument callers.
  definition := replace(
    definition,
    'target_day date DEFAULT (((now() AT TIME ZONE ''Asia/Dubai''::text))::date - 1)',
    'target_day date DEFAULT (current_date - 1)'
  );
  definition := replace(
    definition,
    '''Asia/Dubai''::text',
    '(select time_zone from public.restaurants where id = rid)'
  );
  definition := replace(
    definition,
    '''Asia/Dubai''',
    '(select time_zone from public.restaurants where id = rid)'
  );
  execute definition;

end;
$localize_existing_operational_functions$;

notify pgrst, 'reload schema';
