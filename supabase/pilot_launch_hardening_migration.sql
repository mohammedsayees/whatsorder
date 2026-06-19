-- WhatsOrder pilot launch data-integrity hardening
-- Run once after all existing migrations, including dine_in_migration.sql.
-- Do not rerun schema.sql afterward.

alter table public.restaurants
add column if not exists accepting_orders boolean not null default true;

create table if not exists public.order_submission_keys (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  submission_token text not null,
  order_id uuid references public.orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (restaurant_id, submission_token)
);

alter table public.order_submission_keys enable row level security;
-- Intentionally service-role only. No anon or authenticated policies.

delete from public.loyalty_transactions duplicate
using public.loyalty_transactions original
where duplicate.type = 'earned'
  and original.type = 'earned'
  and duplicate.order_id = original.order_id
  and duplicate.id > original.id;

create unique index if not exists idx_loyalty_one_earned_transaction_per_order
on public.loyalty_transactions(order_id)
where type = 'earned' and order_id is not null;

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

create or replace function public.transition_order_status_and_award_loyalty(
  target_restaurant_id uuid,
  target_order_id uuid,
  target_status text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $transition_order$
declare
  order_record public.orders%rowtype;
  expected_status text;
  customer_record public.customers%rowtype;
  earned_points integer;
  loyalty_transaction_id uuid;
begin
  select *
  into order_record
  from public.orders
  where id = target_order_id
    and restaurant_id = target_restaurant_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  expected_status := case
    when order_record.status = 'New' then 'Accepted'
    when order_record.status = 'Accepted' then 'Preparing'
    when order_record.status = 'Preparing' and order_record.fulfilment_type = 'delivery'
      then 'Out for Delivery'
    when order_record.status = 'Preparing' and order_record.fulfilment_type = 'dine_in'
      then 'Ready to Serve'
    when order_record.status = 'Preparing' then 'Completed'
    when order_record.status in ('Ready to Serve', 'Out for Delivery') then 'Completed'
    else null
  end;

  if target_status = 'Cancelled' then
    if order_record.status in ('Completed', 'Cancelled') then
      raise exception 'This order cannot be cancelled';
    end if;
  elsif expected_status is null or target_status <> expected_status then
    raise exception 'Invalid order status transition';
  end if;

  update public.orders
  set status = target_status::public.order_status
  where id = target_order_id
    and restaurant_id = target_restaurant_id;

  if target_status = 'Completed' then
    earned_points := greatest(0, floor(order_record.total)::integer);

    select *
    into customer_record
    from public.customers
    where restaurant_id = target_restaurant_id
      and phone = order_record.customer_phone
    for update;

    if found and earned_points > 0 then
      insert into public.loyalty_transactions (
        restaurant_id,
        customer_id,
        order_id,
        type,
        points,
        description
      )
      values (
        target_restaurant_id,
        customer_record.id,
        target_order_id,
        'earned',
        earned_points,
        'Earned ' || earned_points || ' points for completed order'
      )
      on conflict (order_id) where type = 'earned' and order_id is not null
      do nothing
      returning id into loyalty_transaction_id;

      if loyalty_transaction_id is not null then
        update public.customers
        set
          loyalty_points_balance = loyalty_points_balance + earned_points,
          lifetime_points_earned = lifetime_points_earned + earned_points
        where id = customer_record.id
          and restaurant_id = target_restaurant_id;

        update public.orders
        set points_earned = earned_points
        where id = target_order_id
          and restaurant_id = target_restaurant_id;
      end if;
    end if;
  end if;

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
    and customer.phone = order_record.customer_phone;

  return target_order_id;
end;
$transition_order$;

revoke all on function public.transition_order_status_and_award_loyalty(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.transition_order_status_and_award_loyalty(uuid, uuid, text)
to service_role;

-- Correct historical aggregates that counted orders before completion.
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
  );

notify pgrst, 'reload schema';
