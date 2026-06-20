-- WhatsOrder P1 pilot operations hardening
-- Run after 20260620_lock_down_public_order_creation.sql.
--
-- Before applying to an existing production project, take a Supabase backup.
-- This migration canonicalizes stored customer phone numbers and may merge
-- duplicate customer rows that represent the same UAE number.

create or replace function public.normalize_customer_phone(input_phone text)
returns text
language sql
immutable
set search_path = public
as $normalize_phone$
  select case
    when regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g') like '00%'
      then substring(regexp_replace(input_phone, '[^0-9]', '', 'g') from 3)
    when regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g') like '05%'
      and length(regexp_replace(input_phone, '[^0-9]', '', 'g')) = 10
      then '971' || substring(regexp_replace(input_phone, '[^0-9]', '', 'g') from 2)
    when regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g') like '5%'
      and length(regexp_replace(input_phone, '[^0-9]', '', 'g')) = 9
      then '971' || regexp_replace(input_phone, '[^0-9]', '', 'g')
    else regexp_replace(coalesce(input_phone, ''), '[^0-9]', '', 'g')
  end;
$normalize_phone$;

alter table public.customers
add column if not exists marketing_consent_updated_at timestamptz,
add column if not exists marketing_consent_source text,
add column if not exists marketing_consent_withdrawn_at timestamptz;

update public.orders
set customer_phone = public.normalize_customer_phone(customer_phone)
where customer_phone <> public.normalize_customer_phone(customer_phone)
  and length(public.normalize_customer_phone(customer_phone)) between 7 and 15;

do $merge_customer_phones$
declare
  duplicate_group record;
  keeper_id uuid;
begin
  for duplicate_group in
    select
      restaurant_id,
      public.normalize_customer_phone(phone) as canonical_phone
    from public.customers
    where length(public.normalize_customer_phone(phone)) between 7 and 15
    group by restaurant_id, public.normalize_customer_phone(phone)
    having count(*) > 1
  loop
    select id
    into keeper_id
    from public.customers
    where restaurant_id = duplicate_group.restaurant_id
      and public.normalize_customer_phone(phone) = duplicate_group.canonical_phone
    order by updated_at desc, created_at desc, id
    limit 1;

    update public.loyalty_transactions
    set customer_id = keeper_id
    where restaurant_id = duplicate_group.restaurant_id
      and customer_id in (
        select id
        from public.customers
        where restaurant_id = duplicate_group.restaurant_id
          and public.normalize_customer_phone(phone) = duplicate_group.canonical_phone
          and id <> keeper_id
      );

    delete from public.customers
    where restaurant_id = duplicate_group.restaurant_id
      and public.normalize_customer_phone(phone) = duplicate_group.canonical_phone
      and id <> keeper_id;
  end loop;
end;
$merge_customer_phones$;

update public.customers
set phone = public.normalize_customer_phone(phone)
where phone <> public.normalize_customer_phone(phone)
  and length(public.normalize_customer_phone(phone)) between 7 and 15;

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
  ),
  marketing_opt_in = consent_marketing,
  marketing_consent_updated_at = coalesce(marketing_consent_updated_at, consent_timestamp),
  marketing_consent_source = coalesce(marketing_consent_source, 'checkout')
where true;

create index if not exists idx_orders_restaurant_status_created
on public.orders(restaurant_id, status, created_at desc);

create index if not exists idx_customers_restaurant_updated
on public.customers(restaurant_id, updated_at desc);

create table if not exists public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_status_events_order_created
on public.order_status_events(restaurant_id, order_id, created_at);

alter table public.order_status_events enable row level security;

drop policy if exists "Restaurant users can read own order status events"
on public.order_status_events;
create policy "Restaurant users can read own order status events"
on public.order_status_events for select
using (public.is_restaurant_member(order_status_events.restaurant_id));

drop policy if exists "Super admins can read all order status events"
on public.order_status_events;
create policy "Super admins can read all order status events"
on public.order_status_events for select
using (public.is_super_admin());

create table if not exists public.order_print_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  print_kind text not null check (print_kind in ('kot', 'receipt')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  device_label text,
  is_reprint boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_print_events_order_created
on public.order_print_events(restaurant_id, order_id, created_at);

alter table public.order_print_events enable row level security;

drop policy if exists "Restaurant users can read own order print events"
on public.order_print_events;
create policy "Restaurant users can read own order print events"
on public.order_print_events for select
using (public.is_restaurant_member(order_print_events.restaurant_id));

drop policy if exists "Super admins can read all order print events"
on public.order_print_events;
create policy "Super admins can read all order print events"
on public.order_print_events for select
using (public.is_super_admin());

create or replace function public.create_order_with_customer_v4(
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
as $create_order_v4$
declare
  canonical_phone text := public.normalize_customer_phone(order_customer_phone);
  created_order_id uuid;
begin
  if length(canonical_phone) < 7 or length(canonical_phone) > 15 then
    raise exception 'A valid canonical customer phone is required';
  end if;

  created_order_id := public.create_order_with_customer_v3(
    target_restaurant_id,
    order_customer_name,
    canonical_phone,
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
    order_consent_timestamp,
    order_submission_token
  );

  update public.customers
  set
    marketing_opt_in = order_consent_marketing,
    consent_marketing = order_consent_marketing,
    consent_timestamp = order_consent_timestamp,
    marketing_consent_updated_at = order_consent_timestamp,
    marketing_consent_source = 'checkout',
    marketing_consent_withdrawn_at =
      case when order_consent_marketing then null else order_consent_timestamp end
  where restaurant_id = target_restaurant_id
    and phone = canonical_phone;

  insert into public.order_status_events (
    restaurant_id,
    order_id,
    from_status,
    to_status,
    actor_role,
    reason
  )
  select
    target_restaurant_id,
    created_order_id,
    null,
    'New',
    'customer',
    'order_created'
  where not exists (
    select 1
    from public.order_status_events
    where restaurant_id = target_restaurant_id
      and order_id = created_order_id
      and reason = 'order_created'
  );

  return created_order_id;
end;
$create_order_v4$;

revoke all on function public.create_order_with_customer_v4(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, text,
  text, text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.create_order_with_customer_v4(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, text,
  text, text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz, text
) to service_role;

create or replace function public.transition_order_status_and_record_event(
  target_restaurant_id uuid,
  target_order_id uuid,
  target_status text,
  event_actor_user_id uuid,
  event_actor_role text,
  event_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $transition_and_record$
declare
  previous_status public.order_status;
  updated_order_id uuid;
begin
  select status
  into previous_status
  from public.orders
  where id = target_order_id
    and restaurant_id = target_restaurant_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  updated_order_id := public.transition_order_status_and_award_loyalty(
    target_restaurant_id,
    target_order_id,
    target_status
  );

  insert into public.order_status_events (
    restaurant_id,
    order_id,
    from_status,
    to_status,
    actor_user_id,
    actor_role,
    reason
  )
  values (
    target_restaurant_id,
    target_order_id,
    previous_status,
    target_status::public.order_status,
    event_actor_user_id,
    nullif(trim(event_actor_role), ''),
    nullif(trim(event_reason), '')
  );

  return updated_order_id;
end;
$transition_and_record$;

revoke all on function public.transition_order_status_and_record_event(
  uuid, uuid, text, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.transition_order_status_and_record_event(
  uuid, uuid, text, uuid, text, text
) to service_role;

create or replace function public.record_order_print_event(
  target_restaurant_id uuid,
  target_order_id uuid,
  target_print_kind text,
  event_actor_user_id uuid,
  event_actor_role text,
  event_device_label text,
  event_is_reprint boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $record_print$
declare
  event_id uuid;
begin
  if target_print_kind not in ('kot', 'receipt') then
    raise exception 'Invalid print kind';
  end if;

  if not exists (
    select 1
    from public.orders
    where id = target_order_id
      and restaurant_id = target_restaurant_id
  ) then
    raise exception 'Order not found';
  end if;

  insert into public.order_print_events (
    restaurant_id,
    order_id,
    print_kind,
    actor_user_id,
    actor_role,
    device_label,
    is_reprint
  )
  values (
    target_restaurant_id,
    target_order_id,
    target_print_kind,
    event_actor_user_id,
    nullif(trim(event_actor_role), ''),
    nullif(left(trim(event_device_label), 160), ''),
    event_is_reprint
  )
  returning id into event_id;

  return event_id;
end;
$record_print$;

revoke all on function public.record_order_print_event(
  uuid, uuid, text, uuid, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.record_order_print_event(
  uuid, uuid, text, uuid, text, text, boolean
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
  with boundaries as (
    select
      date_trunc('day', now() at time zone 'Asia/Dubai') at time zone 'Asia/Dubai'
        as today_start,
      (date_trunc('day', now() at time zone 'Asia/Dubai') + interval '1 day')
        at time zone 'Asia/Dubai' as tomorrow_start
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

create or replace function public.get_super_admin_restaurant_summaries()
returns table (
  restaurant_id uuid,
  orders_count bigint,
  customers_count bigint,
  onboarding_completed bigint,
  onboarding_total bigint,
  last_order_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $restaurant_summaries$
  select
    restaurant.id,
    (select count(*) from public.orders where orders.restaurant_id = restaurant.id),
    (select count(*) from public.customers where customers.restaurant_id = restaurant.id),
    (
      select count(*)
      from public.onboarding_tasks
      where onboarding_tasks.restaurant_id = restaurant.id
        and onboarding_tasks.is_completed = true
    ),
    (
      select count(*)
      from public.onboarding_tasks
      where onboarding_tasks.restaurant_id = restaurant.id
    ),
    (
      select max(orders.created_at)
      from public.orders
      where orders.restaurant_id = restaurant.id
    )
  from public.restaurants restaurant;
$restaurant_summaries$;

revoke all on function public.get_super_admin_restaurant_summaries()
from public, anon, authenticated;
grant execute on function public.get_super_admin_restaurant_summaries()
to service_role;

notify pgrst, 'reload schema';

-- Rollback considerations:
-- 1. Export order_status_events and order_print_events before dropping them.
-- 2. Repoint the app to the v3 order RPC and legacy status RPC before removing
--    the v4/wrapper functions.
-- 3. Phone canonicalization and merged duplicate customer rows are not safely
--    reversible without restoring the pre-migration backup.
