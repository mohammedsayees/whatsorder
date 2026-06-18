-- WhatsOrder Delivery, Takeaway, and Bring to My Car fulfilment options
-- Run after security_hardening_migration.sql.

alter table public.restaurants
add column if not exists car_pickup_enabled boolean not null default false;

alter table public.orders
add column if not exists fulfilment_type text not null default 'delivery',
add column if not exists car_plate_number text,
add column if not exists car_description text;

alter table public.orders
alter column delivery_area drop not null,
alter column delivery_address drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_fulfilment_type_check'
  ) then
    alter table public.orders
      add constraint orders_fulfilment_type_check
      check (fulfilment_type in ('delivery', 'takeaway', 'car_pickup'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_car_pickup_plate_check'
  ) then
    alter table public.orders
      add constraint orders_car_pickup_plate_check
      check (
        fulfilment_type <> 'car_pickup'
        or nullif(trim(car_plate_number), '') is not null
      );
  end if;
end $$;

create index if not exists idx_orders_restaurant_fulfilment_created
on public.orders(restaurant_id, fulfilment_type, created_at desc);

create or replace function public.create_order_with_customer(
  target_restaurant_id uuid,
  order_customer_name text,
  order_customer_phone text,
  order_fulfilment_type text,
  order_car_plate_number text,
  order_car_description text,
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
  order_consent_timestamp timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_order$
declare
  new_order_id uuid;
  restaurant_record public.restaurants%rowtype;
  is_delivery boolean := order_fulfilment_type = 'delivery';
begin
  if order_fulfilment_type not in ('delivery', 'takeaway', 'car_pickup') then
    raise exception 'Invalid fulfilment type';
  end if;

  if not order_consent_processing then
    raise exception 'Order-processing consent is required';
  end if;

  if jsonb_typeof(order_items) <> 'array' or jsonb_array_length(order_items) = 0 then
    raise exception 'Order items are required';
  end if;

  if order_subtotal < 0 or order_delivery_fee < 0 or order_total < 0 then
    raise exception 'Order totals cannot be negative';
  end if;

  select *
  into restaurant_record
  from public.restaurants
  where id = target_restaurant_id
    and is_active = true
    and status in ('live', 'trial', 'paid');

  if not found then
    raise exception 'Restaurant is not accepting orders';
  end if;

  if order_fulfilment_type = 'delivery' then
    if restaurant_record.delivery_enabled is not true then
      raise exception 'Delivery is not enabled';
    end if;
    if nullif(trim(order_delivery_area), '') is null
       or nullif(trim(order_delivery_address), '') is null then
      raise exception 'Delivery details are required';
    end if;
    if order_delivery_fee <> restaurant_record.delivery_fee
       or order_total <> order_subtotal + restaurant_record.delivery_fee then
      raise exception 'Delivery total is invalid';
    end if;
  elsif order_fulfilment_type = 'takeaway' then
    if restaurant_record.pickup_enabled is not true then
      raise exception 'Takeaway is not enabled';
    end if;
    if order_delivery_fee <> 0 or order_total <> order_subtotal then
      raise exception 'Takeaway total is invalid';
    end if;
  else
    if restaurant_record.car_pickup_enabled is not true then
      raise exception 'Car pickup is not enabled';
    end if;
    if nullif(trim(order_car_plate_number), '') is null then
      raise exception 'Car plate number is required';
    end if;
    if order_delivery_fee <> 0 or order_total <> order_subtotal then
      raise exception 'Car pickup total is invalid';
    end if;
  end if;

  insert into public.orders (
    restaurant_id,
    customer_name,
    customer_phone,
    fulfilment_type,
    car_plate_number,
    car_description,
    delivery_area,
    delivery_address,
    delivery_latitude,
    delivery_longitude,
    delivery_google_maps_url,
    delivery_place_id,
    delivery_address_text,
    delivery_landmark,
    notes,
    payment_method,
    items,
    subtotal,
    delivery_fee,
    total,
    points_earned,
    points_redeemed,
    loyalty_discount,
    status,
    whatsapp_message,
    consent_order_processing,
    consent_marketing,
    consent_timestamp
  )
  values (
    target_restaurant_id,
    order_customer_name,
    order_customer_phone,
    order_fulfilment_type,
    nullif(trim(order_car_plate_number), ''),
    nullif(trim(order_car_description), ''),
    case when is_delivery then order_delivery_area else null end,
    case when is_delivery then order_delivery_address else null end,
    case when is_delivery then order_delivery_latitude else null end,
    case when is_delivery then order_delivery_longitude else null end,
    case when is_delivery then order_delivery_google_maps_url else null end,
    case when is_delivery then order_delivery_place_id else null end,
    case when is_delivery then order_delivery_address_text else null end,
    case when is_delivery then order_delivery_landmark else null end,
    order_notes,
    order_payment_method::public.payment_method,
    order_items,
    order_subtotal,
    order_delivery_fee,
    order_total,
    0,
    0,
    0,
    'New',
    order_whatsapp_message,
    order_consent_processing,
    order_consent_marketing,
    order_consent_timestamp
  )
  returning id into new_order_id;

  insert into public.customers (
    restaurant_id,
    name,
    phone,
    delivery_area,
    delivery_address,
    default_latitude,
    default_longitude,
    default_google_maps_url,
    default_address_text,
    default_landmark,
    total_orders,
    total_spend,
    last_order_at,
    marketing_opt_in,
    consent_order_processing,
    consent_marketing,
    consent_timestamp,
    loyalty_points_balance,
    lifetime_points_earned,
    updated_at
  )
  values (
    target_restaurant_id,
    order_customer_name,
    order_customer_phone,
    case when is_delivery then order_delivery_area else '' end,
    case when is_delivery then order_delivery_address else '' end,
    case when is_delivery then order_delivery_latitude else null end,
    case when is_delivery then order_delivery_longitude else null end,
    case when is_delivery then order_delivery_google_maps_url else null end,
    case when is_delivery then order_delivery_address_text else null end,
    case when is_delivery then order_delivery_landmark else null end,
    1,
    order_total,
    order_consent_timestamp,
    order_consent_marketing,
    order_consent_processing,
    order_consent_marketing,
    order_consent_timestamp,
    0,
    0,
    order_consent_timestamp
  )
  on conflict (restaurant_id, phone) do update set
    name = excluded.name,
    delivery_area = case
      when is_delivery then excluded.delivery_area
      else customers.delivery_area
    end,
    delivery_address = case
      when is_delivery then excluded.delivery_address
      else customers.delivery_address
    end,
    default_latitude = case
      when is_delivery then excluded.default_latitude
      else customers.default_latitude
    end,
    default_longitude = case
      when is_delivery then excluded.default_longitude
      else customers.default_longitude
    end,
    default_google_maps_url = case
      when is_delivery then excluded.default_google_maps_url
      else customers.default_google_maps_url
    end,
    default_address_text = case
      when is_delivery then excluded.default_address_text
      else customers.default_address_text
    end,
    default_landmark = case
      when is_delivery then excluded.default_landmark
      else customers.default_landmark
    end,
    total_orders = customers.total_orders + 1,
    total_spend = customers.total_spend + excluded.total_spend,
    last_order_at = excluded.last_order_at,
    marketing_opt_in = customers.marketing_opt_in or excluded.marketing_opt_in,
    consent_order_processing = excluded.consent_order_processing,
    consent_marketing = customers.consent_marketing or excluded.consent_marketing,
    consent_timestamp = excluded.consent_timestamp,
    updated_at = excluded.updated_at;

  return new_order_id;
end;
$create_order$;

revoke all on function public.create_order_with_customer(
  uuid, text, text, text, text, text, text, text, numeric, numeric, text, text,
  text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz
) from public, anon, authenticated;

grant execute on function public.create_order_with_customer(
  uuid, text, text, text, text, text, text, text, numeric, numeric, text, text,
  text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz
) to service_role;

notify pgrst, 'reload schema';
