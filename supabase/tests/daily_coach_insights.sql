-- Rollback-only integration checks for the tenant-scoped Daily Coach payload.
begin;

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active)
values
  (
    '26000000-0000-0000-0000-000000000001',
    'Daily Coach Tenant A',
    'daily-coach-a',
    '971500000081',
    'live',
    true
  ),
  (
    '26000000-0000-0000-0000-000000000002',
    'Daily Coach Tenant B',
    'daily-coach-b',
    '971500000082',
    'live',
    true
  );

insert into public.orders (
  id,
  restaurant_id,
  customer_name,
  customer_phone,
  fulfilment_type,
  delivery_area,
  delivery_address,
  payment_method,
  items,
  subtotal,
  delivery_fee,
  total,
  status,
  whatsapp_message,
  consent_order_processing,
  consent_marketing,
  consent_timestamp,
  created_at
)
values
  -- A prior non-comparison-day order makes the first current customer repeat.
  (
    '46000000-0000-0000-0000-000000000001',
    '26000000-0000-0000-0000-000000000001',
    'Repeat customer',
    '971500000091',
    'delivery',
    'Al Rawda 3',
    'Test address',
    'Cash on Delivery',
    '[{"item_id":"tea","name":"Karak Tea","quantity":1,"price":5}]'::jsonb,
    5,
    0,
    5,
    'Completed',
    'test',
    true,
    true,
    '2026-07-12 05:00:00+00',
    '2026-07-12 05:00:00+00'
  ),
  -- Last Monday baseline: two morning orders.
  (
    '46000000-0000-0000-0000-000000000002',
    '26000000-0000-0000-0000-000000000001',
    'Prior one',
    '971500000092',
    'takeaway',
    '',
    '',
    'Card on Delivery',
    '[{"item_id":"tea","name":"Karak Tea","quantity":1,"price":5}]'::jsonb,
    5,
    0,
    5,
    'Completed',
    'test',
    true,
    false,
    '2026-07-06 04:00:00+00',
    '2026-07-06 04:00:00+00'
  ),
  (
    '46000000-0000-0000-0000-000000000003',
    '26000000-0000-0000-0000-000000000001',
    'Prior two',
    '971500000093',
    'takeaway',
    '',
    '',
    'Cash on Delivery',
    '[{"item_id":"snack","name":"Samosa","quantity":1,"price":5}]'::jsonb,
    5,
    0,
    5,
    'Completed',
    'test',
    true,
    false,
    '2026-07-06 05:00:00+00',
    '2026-07-06 05:00:00+00'
  ),
  -- Current Monday: three morning deliveries in one area (privacy threshold).
  (
    '46000000-0000-0000-0000-000000000004',
    '26000000-0000-0000-0000-000000000001',
    'Repeat customer',
    '971500000091',
    'delivery',
    'Al Rawda 3',
    'Test address',
    'Cash on Delivery',
    '[{"item_id":"tea","name":"Karak Tea","quantity":2,"price":5}]'::jsonb,
    10,
    0,
    10,
    'Completed',
    'test',
    true,
    true,
    '2026-07-13 04:00:00+00',
    '2026-07-13 04:00:00+00'
  ),
  (
    '46000000-0000-0000-0000-000000000005',
    '26000000-0000-0000-0000-000000000001',
    'New customer',
    '971500000094',
    'delivery',
    'Al Rawda 3',
    'Test address',
    'Card on Delivery',
    '[{"item_id":"tea","name":"Karak Tea","quantity":1,"price":5}]'::jsonb,
    10,
    0,
    10,
    'Completed',
    'test',
    true,
    false,
    '2026-07-13 05:00:00+00',
    '2026-07-13 05:00:00+00'
  ),
  (
    '46000000-0000-0000-0000-000000000006',
    '26000000-0000-0000-0000-000000000001',
    'Anonymous customer',
    '',
    'delivery',
    'Al Rawda 3',
    'Test address',
    'Cash on Delivery',
    '[{"item_id":"snack","name":"Samosa","quantity":2,"price":5}]'::jsonb,
    10,
    0,
    10,
    'Completed',
    'test',
    true,
    false,
    '2026-07-13 06:00:00+00',
    '2026-07-13 06:00:00+00'
  ),
  -- One completed night order and one cancelled order.
  (
    '46000000-0000-0000-0000-000000000007',
    '26000000-0000-0000-0000-000000000001',
    'Night customer',
    '971500000095',
    'takeaway',
    '',
    '',
    'Cash on Delivery',
    '[{"item_id":"meal","name":"Burger","quantity":1,"price":15}]'::jsonb,
    15,
    0,
    15,
    'Completed',
    'test',
    true,
    false,
    '2026-07-13 16:00:00+00',
    '2026-07-13 16:00:00+00'
  ),
  (
    '46000000-0000-0000-0000-000000000008',
    '26000000-0000-0000-0000-000000000001',
    'Cancelled customer',
    '971500000096',
    'takeaway',
    '',
    '',
    'Cash on Delivery',
    '[]'::jsonb,
    99,
    0,
    99,
    'Cancelled',
    'test',
    true,
    false,
    '2026-07-13 05:30:00+00',
    '2026-07-13 05:30:00+00'
  ),
  -- Cross-tenant order must never affect Tenant A.
  (
    '46000000-0000-0000-0000-000000000009',
    '26000000-0000-0000-0000-000000000002',
    'Other tenant customer',
    '971500000097',
    'delivery',
    'Al Rawda 3',
    'Other address',
    'Cash on Delivery',
    '[{"item_id":"other","name":"Other item","quantity":100,"price":100}]'::jsonb,
    10000,
    0,
    10000,
    'Completed',
    'test',
    true,
    true,
    '2026-07-13 05:00:00+00',
    '2026-07-13 05:00:00+00'
  );

do $daily_coach_checks$
declare
  insight jsonb;
  morning jsonb;
begin
  insight := public.daily_coach_insights(
    '26000000-0000-0000-0000-000000000001',
    '2026-07-13'::date
  );

  if (insight->>'completed_order_count')::integer <> 4
     or (insight->>'completed_sales')::numeric <> 45 then
    raise exception 'Daily Coach did not use completed tenant sales: %', insight;
  end if;

  if (insight->>'last_week_count')::integer <> 2
     or (insight->>'cancelled_count')::integer <> 1 then
    raise exception 'Daily Coach comparisons or cancellations are incorrect';
  end if;

  select period
  into morning
  from jsonb_array_elements(insight->'periods') period
  where period->>'key' = 'morning';

  if (morning->>'order_count')::integer <> 3
     or (morning->'top_item'->>'name') <> 'Karak Tea'
     or (morning->'top_delivery_area'->>'area') <> 'Al Rawda 3'
     or (morning->>'repeat_customer_orders')::integer <> 1 then
    raise exception 'Morning period insight is incorrect: %', morning;
  end if;

  if jsonb_array_length(insight->'location_insights') <> 1 then
    raise exception 'Location privacy threshold or aggregation is incorrect';
  end if;
end;
$daily_coach_checks$;

rollback;
