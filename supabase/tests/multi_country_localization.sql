-- Rollback-only integration checks for UAE/India tenant localization.
begin;

insert into public.restaurants (
  id,
  name,
  slug,
  whatsapp_number,
  status,
  is_active,
  country_code,
  currency_code,
  locale,
  time_zone,
  phone_country_code
)
values
  (
    '25000000-0000-0000-0000-000000000001',
    'Localization UAE',
    'localization-uae',
    '971500000071',
    'live',
    true,
    'AE',
    'AED',
    'en-AE',
    'Asia/Dubai',
    '971'
  ),
  (
    '25000000-0000-0000-0000-000000000002',
    'Localization India',
    'localization-india',
    '919876543210',
    'live',
    true,
    'IN',
    'INR',
    'en-IN',
    'Asia/Kolkata',
    '91'
  );

insert into public.customers (
  restaurant_id,
  name,
  phone,
  delivery_area,
  delivery_address,
  total_orders,
  total_spend,
  last_order_at
)
values
  (
    '25000000-0000-0000-0000-000000000001',
    'UAE value customer',
    '971500000072',
    '',
    '',
    1,
    300,
    now()
  ),
  (
    '25000000-0000-0000-0000-000000000002',
    'India value customer',
    '919876543211',
    '',
    '',
    1,
    300,
    now()
  );

insert into public.restaurant_shifts (
  id,
  restaurant_id,
  shift_name,
  opening_cash_amount,
  opened_by_user_id
)
values (
  '85000000-0000-0000-0000-000000000001',
  '25000000-0000-0000-0000-000000000002',
  'India UPI check',
  0,
  '15000000-0000-0000-0000-000000000001'
);

insert into public.orders (
  id,
  restaurant_id,
  customer_name,
  customer_phone,
  payment_method,
  items,
  subtotal,
  delivery_fee,
  total,
  status,
  shift_id,
  whatsapp_message,
  consent_order_processing,
  consent_timestamp
)
values (
  '45000000-0000-0000-0000-000000000001',
  '25000000-0000-0000-0000-000000000002',
  'UPI customer',
  '919876543212',
  'UPI',
  '[]'::jsonb,
  125,
  0,
  125,
  'Completed',
  '85000000-0000-0000-0000-000000000001',
  'test',
  true,
  now()
);

do $localization_checks$
declare
  india public.restaurants%rowtype;
  projected record;
  india_segments jsonb;
  shift_summary jsonb;
  uae_segments jsonb;
  schedule jsonb := '{
    "monday":{"closed":false,"open":"08:00","close":"09:00"},
    "tuesday":{"closed":true,"open":"08:00","close":"09:00"},
    "wednesday":{"closed":true,"open":"08:00","close":"09:00"},
    "thursday":{"closed":true,"open":"08:00","close":"09:00"},
    "friday":{"closed":true,"open":"08:00","close":"09:00"},
    "saturday":{"closed":true,"open":"08:00","close":"09:00"},
    "sunday":{"closed":true,"open":"08:00","close":"09:00"}
  }'::jsonb;
begin
  select * into india
  from public.restaurants
  where id = '25000000-0000-0000-0000-000000000002';

  if india.currency_code <> 'INR'
     or india.time_zone <> 'Asia/Kolkata'
     or india.phone_country_code <> '91' then
    raise exception 'India localization profile was not persisted';
  end if;

  select * into projected
  from public.get_public_restaurant('localization-india');

  if projected.country_code <> 'IN'
     or projected.currency_code <> 'INR'
     or projected.time_zone <> 'Asia/Kolkata' then
    raise exception 'Public restaurant projection omitted India localization';
  end if;

  -- 2026-07-13 03:00 UTC is 07:00 Dubai (closed) and 08:30 Kolkata (open).
  if public.is_restaurant_open_at(
    true,
    schedule,
    'Asia/Dubai',
    '2026-07-13 03:00:00+00'::timestamptz
  ) then
    raise exception 'Dubai schedule unexpectedly open';
  end if;

  if not public.is_restaurant_open_at(
    true,
    schedule,
    'Asia/Kolkata',
    '2026-07-13 03:00:00+00'::timestamptz
  ) then
    raise exception 'Kolkata schedule unexpectedly closed';
  end if;

  perform 'UPI'::public.payment_method;

  shift_summary := public.calculate_restaurant_shift_summary(
    '25000000-0000-0000-0000-000000000002',
    '85000000-0000-0000-0000-000000000001'
  );
  if (shift_summary->>'upi_total')::numeric <> 125
     or (shift_summary->>'expected_cash_amount')::numeric <> 0 then
    raise exception 'UPI shift reconciliation is incorrect: %', shift_summary;
  end if;

  uae_segments := public.get_customer_segment_page(
    '25000000-0000-0000-0000-000000000001'
  );
  india_segments := public.get_customer_segment_page(
    '25000000-0000-0000-0000-000000000002'
  );
  if (uae_segments->'summary'->>'vip')::integer <> 1
     or (india_segments->'summary'->>'vip')::integer <> 0 then
    raise exception 'Country-specific VIP thresholds are incorrect';
  end if;

  begin
    update public.restaurants
    set currency_code = 'AED'
    where id = '25000000-0000-0000-0000-000000000002';
    raise exception 'Invalid India/AED profile unexpectedly succeeded';
  exception
    when check_violation then
      null;
  end;
end;
$localization_checks$;

rollback;
