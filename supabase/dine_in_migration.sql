-- WhatsOrder Dine In fulfilment
-- Run after fulfilment_options_migration.sql.

alter table public.restaurants
add column if not exists dine_in_enabled boolean not null default false;

alter table public.orders
add column if not exists table_number text;

alter type public.order_status add value if not exists 'Ready to Serve';

alter table public.orders drop constraint if exists orders_fulfilment_type_check;
alter table public.orders
add constraint orders_fulfilment_type_check
check (fulfilment_type in ('delivery', 'takeaway', 'car_pickup', 'dine_in'));

alter table public.orders drop constraint if exists orders_dine_in_table_check;
alter table public.orders
add constraint orders_dine_in_table_check
check (
  fulfilment_type <> 'dine_in'
  or nullif(trim(table_number), '') is not null
);

create or replace function public.create_order_with_customer_v2(
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
  order_consent_timestamp timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $dine_in_order$
declare
  new_order_id uuid;
begin
  if order_fulfilment_type = 'dine_in' then
    if nullif(trim(order_table_number), '') is null then
      raise exception 'Table number is required';
    end if;

    if not exists (
      select 1
      from public.restaurants
      where id = target_restaurant_id
        and dine_in_enabled = true
        and is_active = true
        and status in ('live', 'trial', 'paid')
    ) then
      raise exception 'Dine In is not enabled';
    end if;

    if not order_consent_processing then
      raise exception 'Order-processing consent is required';
    end if;

    if jsonb_typeof(order_items) <> 'array' or jsonb_array_length(order_items) = 0 then
      raise exception 'Order items are required';
    end if;

    if order_subtotal < 0 or order_delivery_fee <> 0 or order_total <> order_subtotal then
      raise exception 'Dine In total is invalid';
    end if;

    insert into public.orders (
      restaurant_id,
      customer_name,
      customer_phone,
      fulfilment_type,
      table_number,
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
      'dine_in',
      trim(order_table_number),
      order_notes,
      order_payment_method::public.payment_method,
      order_items,
      order_subtotal,
      0,
      order_subtotal,
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
      '',
      '',
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
      total_orders = customers.total_orders + 1,
      total_spend = customers.total_spend + excluded.total_spend,
      last_order_at = excluded.last_order_at,
      marketing_opt_in = customers.marketing_opt_in or excluded.marketing_opt_in,
      consent_order_processing = excluded.consent_order_processing,
      consent_marketing = customers.consent_marketing or excluded.consent_marketing,
      consent_timestamp = excluded.consent_timestamp,
      updated_at = excluded.updated_at;

    return new_order_id;
  end if;

  return public.create_order_with_customer(
    target_restaurant_id,
    order_customer_name,
    order_customer_phone,
    order_fulfilment_type,
    order_car_plate_number,
    order_car_description,
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
end;
$dine_in_order$;

revoke all on function public.create_order_with_customer_v2(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, text,
  text, text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz
) from public, anon, authenticated;

grant execute on function public.create_order_with_customer_v2(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, text,
  text, text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz
) to service_role;

notify pgrst, 'reload schema';
