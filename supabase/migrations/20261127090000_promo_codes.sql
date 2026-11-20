-- Promo codes for the customer (PWA) checkout — order discounts phase 2.
--
-- Owners create restaurant-scoped codes (percent or fixed, optional cap,
-- minimum subtotal, date window, total and per-customer limits, first-order
-- only). The customer enters a code at checkout; the server re-checks it and
-- create_order_with_customer_v6 validates it again under a row lock, in the
-- same transaction that saves the order and records the redemption.
--
-- Builds on 20261126090000_staff_order_discounts.sql: a promo discount uses
-- the same orders.discount_* columns (so totals stay reconciled by the same
-- constraint) plus an orders.promo_code snapshot. Cancelled orders do not
-- count toward a code's limits. Additive; existing rows are not rewritten.

begin;

create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,23}$'),
  description text check (description is null or char_length(description) <= 200),
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(10, 2) not null check (discount_value > 0),
  max_discount numeric(10, 2) check (max_discount is null or max_discount > 0),
  min_subtotal numeric(10, 2) not null default 0 check (min_subtotal >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  max_redemptions_per_customer integer default 1
    check (max_redemptions_per_customer is null or max_redemptions_per_customer > 0),
  first_order_only boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promo_codes_percent_range
    check (discount_type <> 'percent' or discount_value <= 100),
  constraint promo_codes_window
    check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint promo_codes_restaurant_code_key unique (restaurant_id, code),
  constraint promo_codes_id_restaurant_key unique (id, restaurant_id)
);

create table if not exists public.promo_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  promo_code_id uuid not null,
  order_id uuid not null,
  customer_phone text not null,
  discount_amount numeric(10, 2) not null check (discount_amount > 0),
  created_at timestamptz not null default now(),
  constraint promo_code_redemptions_code_tenant_fkey
    foreign key (promo_code_id, restaurant_id)
    references public.promo_codes(id, restaurant_id)
    on delete restrict,
  constraint promo_code_redemptions_order_tenant_fkey
    foreign key (order_id, restaurant_id)
    references public.orders(id, restaurant_id)
    on delete cascade,
  constraint promo_code_redemptions_order_key unique (order_id)
);

create index if not exists idx_promo_code_redemptions_code_phone
on public.promo_code_redemptions(promo_code_id, customer_phone);

alter table public.orders
  add column if not exists promo_code text;

do $promo_order_constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'orders_promo_code_has_discount'
  ) then
    alter table public.orders
      add constraint orders_promo_code_has_discount
      check (promo_code is null or discount_amount > 0);
  end if;
end
$promo_order_constraint$;

alter table public.promo_codes enable row level security;
alter table public.promo_code_redemptions enable row level security;

drop policy if exists "Tenant members can read promo codes" on public.promo_codes;
create policy "Tenant members can read promo codes"
on public.promo_codes
for select
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists "Tenant members can read promo code redemptions"
on public.promo_code_redemptions;
create policy "Tenant members can read promo code redemptions"
on public.promo_code_redemptions
for select
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

revoke all on table public.promo_codes from anon, authenticated;
revoke all on table public.promo_code_redemptions from anon, authenticated;
grant select on table public.promo_codes to authenticated;
grant select on table public.promo_code_redemptions to authenticated;

-- Customer checkout. Same parameters as v5 plus the promo code and the
-- discount the checkout showed. Without a code it is exactly v5.
create or replace function public.create_order_with_customer_v6(
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
  order_submission_token text,
  order_promo_code text,
  order_discount_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $create_order_v6$
declare
  clean_code text := upper(btrim(coalesce(order_promo_code, '')));
  canonical_phone text := public.normalize_customer_phone(order_customer_phone);
  promo public.promo_codes%rowtype;
  expected_amount numeric(10, 2);
  replayed_order_id uuid;
  used_count integer;
  result jsonb;
  saved_order_id uuid;
begin
  if clean_code = '' then
    if coalesce(order_discount_amount, 0) <> 0 then
      raise exception 'Order total does not match';
    end if;
  else
    -- A retried submission returns the order it already created; the
    -- limits below would otherwise count that order against itself.
    select order_id into replayed_order_id
    from public.order_submission_keys
    where restaurant_id = target_restaurant_id
      and submission_token = order_submission_token;

    if replayed_order_id is null then
      select * into promo
      from public.promo_codes
      where restaurant_id = target_restaurant_id
        and code = clean_code
      for update;

      if not found or not promo.is_active then
        raise exception 'Promo code is not valid';
      end if;

      if promo.starts_at is not null and now() < promo.starts_at then
        raise exception 'Promo code is not active yet';
      end if;

      if promo.ends_at is not null and now() > promo.ends_at then
        raise exception 'Promo code has expired';
      end if;

      if order_subtotal < promo.min_subtotal then
        raise exception 'Promo code needs a higher order amount';
      end if;

      expected_amount := case
        when promo.discount_type = 'percent'
          then least(
            round(order_subtotal * promo.discount_value / 100, 2),
            coalesce(promo.max_discount, order_subtotal)
          )
        else least(promo.discount_value, order_subtotal)
      end;
      expected_amount := round(least(expected_amount, order_subtotal), 2);

      if expected_amount <= 0 then
        raise exception 'Promo code is not valid';
      end if;

      if round(coalesce(order_discount_amount, 0), 2) <> expected_amount then
        raise exception 'Promo code discount has changed';
      end if;

      if round(order_total, 2) <> round(order_subtotal - expected_amount + order_delivery_fee, 2) then
        raise exception 'Order total does not match';
      end if;

      if promo.max_redemptions is not null then
        select count(*) into used_count
        from public.promo_code_redemptions redemption
        join public.orders redeemed_order
          on redeemed_order.id = redemption.order_id
         and redeemed_order.restaurant_id = redemption.restaurant_id
        where redemption.promo_code_id = promo.id
          and redeemed_order.status <> 'Cancelled';

        if used_count >= promo.max_redemptions then
          raise exception 'Promo code has been fully used';
        end if;
      end if;

      if promo.max_redemptions_per_customer is not null then
        select count(*) into used_count
        from public.promo_code_redemptions redemption
        join public.orders redeemed_order
          on redeemed_order.id = redemption.order_id
         and redeemed_order.restaurant_id = redemption.restaurant_id
        where redemption.promo_code_id = promo.id
          and redemption.customer_phone = canonical_phone
          and redeemed_order.status <> 'Cancelled';

        if used_count >= promo.max_redemptions_per_customer then
          raise exception 'Promo code already used';
        end if;
      end if;

      if promo.first_order_only and exists (
        select 1 from public.orders previous_order
        where previous_order.restaurant_id = target_restaurant_id
          and previous_order.customer_phone = canonical_phone
          and previous_order.status <> 'Cancelled'
      ) then
        raise exception 'Promo code is for first orders only';
      end if;
    end if;
  end if;

  result := public.create_order_with_customer_v5(
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
    -- The base insert requires total = subtotal + delivery fee; the promo
    -- discount is applied to the saved row below, in this transaction.
    case when clean_code = '' then order_total else order_subtotal + order_delivery_fee end,
    order_whatsapp_message,
    order_consent_processing,
    order_consent_marketing,
    order_consent_timestamp,
    order_submission_token
  );

  if clean_code = '' or replayed_order_id is not null then
    return result;
  end if;

  saved_order_id := (result ->> 'order_id')::uuid;

  update public.orders
  set discount_type = promo.discount_type,
      discount_value = promo.discount_value,
      discount_amount = expected_amount,
      discount_reason = 'Promo code ' || promo.code,
      promo_code = promo.code,
      discounted_at = now(),
      total = total - expected_amount
  where id = saved_order_id
    and restaurant_id = target_restaurant_id
    and discount_amount = 0;

  insert into public.promo_code_redemptions (
    restaurant_id, promo_code_id, order_id, customer_phone, discount_amount
  ) values (
    target_restaurant_id, promo.id, saved_order_id, canonical_phone, expected_amount
  )
  on conflict (order_id) do nothing;

  return result;
end;
$create_order_v6$;

revoke all on function public.create_order_with_customer_v6(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, text,
  text, text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz, text, text, numeric
) from public, anon, authenticated;

grant execute on function public.create_order_with_customer_v6(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, text,
  text, text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz, text, text, numeric
) to service_role;

-- Usage for the checkout's "Apply" preview (the order RPC re-checks under
-- a lock). Cancelled orders do not count. Service-role only.
create or replace function public.get_promo_code_usage(
  target_restaurant_id uuid,
  target_promo_code_id uuid,
  target_phone text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $promo_usage$
  with canonical as (
    select case
      when nullif(btrim(coalesce(target_phone, '')), '') is null then null
      else public.normalize_customer_phone(target_phone)
    end as phone
  ),
  live_redemptions as (
    select redemption.customer_phone
    from public.promo_code_redemptions redemption
    join public.orders redeemed_order
      on redeemed_order.id = redemption.order_id
     and redeemed_order.restaurant_id = redemption.restaurant_id
    where redemption.restaurant_id = target_restaurant_id
      and redemption.promo_code_id = target_promo_code_id
      and redeemed_order.status <> 'Cancelled'
  )
  select jsonb_build_object(
    'total_used', (select count(*) from live_redemptions),
    'customer_used', (
      select count(*) from live_redemptions, canonical
      where live_redemptions.customer_phone = canonical.phone
    ),
    'customer_has_orders', coalesce((
      select exists (
        select 1 from public.orders previous_order, canonical
        where canonical.phone is not null
          and previous_order.restaurant_id = target_restaurant_id
          and previous_order.customer_phone = canonical.phone
          and previous_order.status <> 'Cancelled'
      )
    ), false)
  );
$promo_usage$;

revoke all on function public.get_promo_code_usage(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.get_promo_code_usage(uuid, uuid, text) to service_role;

-- Staff discounts must not overwrite a customer's promo discount (its
-- redemption row records the amount). Otherwise unchanged from phase 1.
create or replace function public.apply_order_discount(
  target_restaurant_id uuid,
  target_order_id uuid,
  requested_type text,
  requested_value numeric,
  requested_reason text,
  event_actor_user_id uuid,
  event_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $apply_discount$
declare
  saved_order public.orders%rowtype;
  staff_limit numeric;
  new_amount numeric(10, 2);
  clean_reason text := left(btrim(coalesce(requested_reason, '')), 200);
begin
  if target_restaurant_id is null or target_order_id is null then
    raise exception 'Order not found';
  end if;

  select * into saved_order
  from public.orders
  where id = target_order_id
    and restaurant_id = target_restaurant_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if saved_order.status in ('Completed', 'Cancelled') then
    raise exception 'Completed or cancelled orders cannot be discounted';
  end if;

  if saved_order.payment_method is not null then
    raise exception 'Paid orders cannot be discounted';
  end if;

  if saved_order.online_payment_status is not null then
    raise exception 'Orders with an online payment cannot be discounted';
  end if;

  if saved_order.promo_code is not null then
    raise exception 'Orders with a promo code cannot be discounted here';
  end if;

  if coalesce(saved_order.loyalty_discount, 0) > 0
     or coalesce(saved_order.points_redeemed, 0) > 0 then
    raise exception 'Orders with loyalty activity cannot be discounted';
  end if;

  if requested_type is null then
    if saved_order.discount_amount = 0 then
      return to_jsonb(saved_order);
    end if;

    update public.orders
    set discount_type = null,
        discount_value = null,
        discount_amount = 0,
        discount_reason = null,
        discounted_by = event_actor_user_id,
        discounted_at = now(),
        total = subtotal - loyalty_discount + delivery_fee,
        updated_at = now()
    where id = target_order_id
      and restaurant_id = target_restaurant_id
    returning * into saved_order;

    return to_jsonb(saved_order);
  end if;

  if requested_type not in ('percent', 'fixed')
     or requested_value is null
     or requested_value <= 0
     or (requested_type = 'percent' and requested_value > 100) then
    raise exception 'Enter a valid discount';
  end if;

  if clean_reason = '' then
    raise exception 'A discount reason is required';
  end if;

  new_amount := case
    when requested_type = 'percent' then round(saved_order.subtotal * requested_value / 100, 2)
    else round(least(requested_value, saved_order.subtotal), 2)
  end;

  if new_amount <= 0 then
    raise exception 'Enter a valid discount';
  end if;

  if event_actor_role = 'staff' then
    select coalesce(staff_discount_max_percent, 10) into staff_limit
    from public.restaurants
    where id = target_restaurant_id;

    if new_amount > round(saved_order.subtotal * coalesce(staff_limit, 10) / 100, 2) then
      raise exception 'Discount exceeds the staff limit';
    end if;
  end if;

  update public.orders
  set discount_type = requested_type,
      discount_value = round(requested_value, 2),
      discount_amount = new_amount,
      discount_reason = clean_reason,
      discounted_by = event_actor_user_id,
      discounted_at = now(),
      total = subtotal - new_amount - loyalty_discount + delivery_fee,
      updated_at = now()
  where id = target_order_id
    and restaurant_id = target_restaurant_id
  returning * into saved_order;

  return to_jsonb(saved_order);
end;
$apply_discount$;

revoke all on function public.apply_order_discount(
  uuid, uuid, text, numeric, text, uuid, text
) from public, anon, authenticated;

grant execute on function public.apply_order_discount(
  uuid, uuid, text, numeric, text, uuid, text
) to service_role;

-- Order queue: also returns promo_code so cards can label promo discounts.
create or replace function public.get_admin_orders_page_v4(
  target_restaurant_id uuid,
  target_status_view text default 'active',
  target_fulfilment text default 'all',
  target_page integer default 1,
  target_page_size integer default 25,
  target_sort text default 'oldest',
  target_search text default null,
  target_source text default 'all'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_status text := lower(coalesce(target_status_view, 'active'));
  selected_fulfilment text := lower(coalesce(target_fulfilment, 'all'));
  selected_source text := lower(coalesce(target_source, 'all'));
  normalized_search text := lower(trim(leading '#' from trim(coalesce(target_search, ''))));
  safe_page integer := greatest(1, coalesce(target_page, 1));
  safe_page_size integer := least(100, greatest(1, coalesce(target_page_size, 25)));
  result jsonb;
begin
  if target_restaurant_id is null then
    raise exception 'Restaurant id is required.' using errcode = '22023';
  end if;

  if selected_status not in (
    'active', 'new', 'preparing', 'ready', 'out_for_delivery',
    'completed', 'cancelled'
  ) then
    raise exception 'Invalid order status view.' using errcode = '22023';
  end if;

  if selected_fulfilment not in (
    'all', 'delivery', 'takeaway', 'dine_in', 'car_pickup'
  ) then
    raise exception 'Invalid fulfilment view.' using errcode = '22023';
  end if;

  if selected_source not in ('all', 'customer', 'staff', 'whatsapp_chat') then
    raise exception 'Invalid order source view.' using errcode = '22023';
  end if;

  with searched_orders as materialized (
    select
      orders.id,
      orders.parent_order_id,
      orders.customer_id,
      orders.customer_name,
      orders.customer_phone,
      orders.fulfilment_type,
      orders.car_plate_number,
      orders.car_description,
      orders.table_number,
      orders.delivery_area,
      orders.delivery_address,
      orders.delivery_google_maps_url,
      orders.delivery_landmark,
      orders.notes,
      orders.payment_method,
      orders.items,
      orders.subtotal,
      orders.delivery_fee,
      orders.total,
      orders.points_earned,
      orders.loyalty_discount,
      orders.discount_amount,
      orders.discount_type,
      orders.discount_value,
      orders.discount_reason,
      orders.promo_code,
      orders.online_payment_status,
      orders.status,
      orders.created_at,
      orders.status_started_at,
      orders.closed_at,
      orders.source,
      orders.punched_at,
      public.order_start_time(
        orders.created_at, orders.punched_at, orders.source
      ) as order_started_at,
      public.order_start_time(
        orders.created_at, orders.punched_at, orders.source
      ) + make_interval(
        mins => coalesce((
          select (restaurant.order_target_minutes ->> orders.fulfilment_type::text)::integer
          from public.restaurants restaurant
          where restaurant.id = target_restaurant_id
        ), 30)
      ) as due_at
    from public.orders
    where orders.restaurant_id = target_restaurant_id
      and (selected_source = 'all' or orders.source = selected_source)
      and (
        normalized_search = ''
        or position(normalized_search in lower(orders.id::text)) > 0
        or position(normalized_search in lower(coalesce(orders.customer_name, ''))) > 0
        or position(normalized_search in lower(coalesce(orders.customer_phone, ''))) > 0
      )
  ),
  status_counts as (
    select
      count(*) filter (where status in (
        'New', 'Accepted', 'Preparing', 'Ready to Serve', 'Out for Delivery'
      )) as active_count,
      count(*) filter (where status = 'New') as new_count,
      count(*) filter (where status in ('Accepted', 'Preparing')) as preparing_count,
      count(*) filter (where status = 'Ready to Serve') as ready_count,
      count(*) filter (where status = 'Out for Delivery') as out_for_delivery_count,
      count(*) filter (where status = 'Completed') as completed_count,
      count(*) filter (where status = 'Cancelled') as cancelled_count
    from searched_orders
  ),
  status_orders as materialized (
    select *
    from searched_orders
    where case selected_status
      when 'active' then status in (
        'New', 'Accepted', 'Preparing', 'Ready to Serve', 'Out for Delivery'
      )
      when 'new' then status = 'New'
      when 'preparing' then status in ('Accepted', 'Preparing')
      when 'ready' then status = 'Ready to Serve'
      when 'out_for_delivery' then status = 'Out for Delivery'
      when 'completed' then status = 'Completed'
      else status = 'Cancelled'
    end
  ),
  fulfilment_counts as (
    select
      count(*) as all_count,
      count(*) filter (where fulfilment_type = 'delivery') as delivery_count,
      count(*) filter (where fulfilment_type = 'takeaway') as takeaway_count,
      count(*) filter (where fulfilment_type = 'dine_in') as dine_in_count,
      count(*) filter (where fulfilment_type = 'car_pickup') as car_pickup_count
    from status_orders
  ),
  filtered_orders as materialized (
    select *
    from status_orders
    where selected_fulfilment = 'all'
       or fulfilment_type = selected_fulfilment
  ),
  paged_orders as (
    select coalesce(
      jsonb_agg(
        to_jsonb(page_row)
        order by
          case when selected_status not in ('completed', 'cancelled')
              and target_sort = 'overdue' then page_row.due_at end asc,
          case when selected_status not in ('completed', 'cancelled')
            then page_row.order_started_at end asc,
          case when selected_status in ('completed', 'cancelled')
            then page_row.created_at end desc
      ),
      '[]'::jsonb
    ) as items
    from (
      select *
      from filtered_orders
      order by
        case when selected_status not in ('completed', 'cancelled')
            and target_sort = 'overdue' then due_at end asc,
        case when selected_status not in ('completed', 'cancelled')
          then order_started_at end asc,
        case when selected_status in ('completed', 'cancelled')
          then created_at end desc
      limit safe_page_size
      offset (safe_page - 1) * safe_page_size
    ) as page_row
  )
  select jsonb_build_object(
    'items', paged_orders.items,
    'total', (select count(*) from filtered_orders),
    'status_counts', jsonb_build_object(
      'active', status_counts.active_count,
      'new', status_counts.new_count,
      'preparing', status_counts.preparing_count,
      'ready', status_counts.ready_count,
      'out_for_delivery', status_counts.out_for_delivery_count,
      'completed', status_counts.completed_count,
      'cancelled', status_counts.cancelled_count
    ),
    'fulfilment_counts', jsonb_build_object(
      'all', fulfilment_counts.all_count,
      'delivery', fulfilment_counts.delivery_count,
      'takeaway', fulfilment_counts.takeaway_count,
      'dine_in', fulfilment_counts.dine_in_count,
      'car_pickup', fulfilment_counts.car_pickup_count
    )
  )
  into result
  from status_counts
  cross join fulfilment_counts
  cross join paged_orders;

  return result;
end;
$$;

revoke all on function public.get_admin_orders_page_v4(
  uuid, text, text, integer, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.get_admin_orders_page_v4(
  uuid, text, text, integer, integer, text, text, text
) to service_role;

do $verify_admin_orders_page_v4$
begin
  if has_function_privilege('anon', 'public.get_admin_orders_page_v4(uuid, text, text, integer, integer, text, text, text)', 'execute')
    or has_function_privilege('authenticated', 'public.get_admin_orders_page_v4(uuid, text, text, integer, integer, text, text, text)', 'execute') then
    raise exception 'get_admin_orders_page_v4 must stay service-role only';
  end if;
end;
$verify_admin_orders_page_v4$;

notify pgrst, 'reload schema';
commit;
