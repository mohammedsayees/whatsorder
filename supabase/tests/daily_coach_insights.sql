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
  ),
  -- Two Mondays ago: one completed lunch order makes it a second trading day.
  (
    '46000000-0000-0000-0000-000000000010',
    '26000000-0000-0000-0000-000000000001',
    'Earlier customer',
    '971500000098',
    'takeaway',
    '',
    '',
    'Cash on Delivery',
    '[{"item_id":"tea","name":"Karak Tea","quantity":1,"price":5}]'::jsonb,
    5,
    0,
    5,
    'Completed',
    'test',
    true,
    false,
    '2026-06-29 08:00:00+00',
    '2026-06-29 08:00:00+00'
  ),
  -- Three Mondays ago: only a cancelled order, so not a trading day. Four
  -- Mondays ago has no orders at all (closed). Neither may dilute baselines.
  (
    '46000000-0000-0000-0000-000000000011',
    '26000000-0000-0000-0000-000000000001',
    'Cancelled earlier',
    '971500000099',
    'takeaway',
    '',
    '',
    'Cash on Delivery',
    '[]'::jsonb,
    5,
    0,
    5,
    'Cancelled',
    'test',
    true,
    false,
    '2026-06-22 08:00:00+00',
    '2026-06-22 08:00:00+00'
  ),
  -- Current Monday: two orders staff never closed out.
  (
    '46000000-0000-0000-0000-000000000012',
    '26000000-0000-0000-0000-000000000001',
    'Unfinished one',
    '',
    'takeaway',
    '',
    '',
    'Cash on Delivery',
    '[{"item_id":"tea","name":"Karak Tea","quantity":1,"price":5}]'::jsonb,
    5,
    0,
    5,
    'Preparing',
    'test',
    true,
    false,
    '2026-07-13 09:00:00+00',
    '2026-07-13 09:00:00+00'
  ),
  (
    '46000000-0000-0000-0000-000000000013',
    '26000000-0000-0000-0000-000000000001',
    'Unfinished two',
    '971500000100',
    'takeaway',
    '',
    '',
    'Cash on Delivery',
    '[{"item_id":"tea","name":"Karak Tea","quantity":1,"price":5}]'::jsonb,
    5,
    0,
    5,
    'New',
    'test',
    true,
    false,
    '2026-07-13 10:00:00+00',
    '2026-07-13 10:00:00+00'
  ),
  -- Cross-tenant unfinished order must never affect Tenant A either.
  (
    '46000000-0000-0000-0000-000000000014',
    '26000000-0000-0000-0000-000000000002',
    'Other tenant unfinished',
    '971500000101',
    'takeaway',
    '',
    '',
    'Cash on Delivery',
    '[]'::jsonb,
    5,
    0,
    5,
    'Preparing',
    'test',
    true,
    false,
    '2026-07-13 10:00:00+00',
    '2026-07-13 10:00:00+00'
  );

-- The anonymous morning delivery was punched in by staff, not a checkout.
update public.orders
set source = 'staff'
where id = '46000000-0000-0000-0000-000000000006';

do $daily_coach_checks$
declare
  insight jsonb;
  morning jsonb;
  lunch jsonb;
  owner_report jsonb;
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

  -- Trading-day baselines: only 2026-07-06 and 2026-06-29 had completed
  -- orders. 2026-06-22 (cancelled only) and 2026-06-15 (no orders) are excluded
  -- rather than averaged in as zero.
  if (insight->>'same_weekday_trading_days')::integer <> 2
     or (insight->>'same_weekday_average')::numeric <> 1.5 then
    raise exception 'Same-weekday average must use trading days only: %', insight;
  end if;

  if (morning->>'baseline_trading_days')::integer <> 2
     or (morning->>'baseline_order_count')::numeric <> 1.0 then
    raise exception 'Morning baseline must average over trading days: %', morning;
  end if;

  select period
  into lunch
  from jsonb_array_elements(insight->'periods') period
  where period->>'key' = 'lunch';

  if (lunch->>'baseline_trading_days')::integer <> 2
     or (lunch->>'baseline_order_count')::numeric <> 0.5 then
    raise exception 'Lunch baseline must average over trading days: %', lunch;
  end if;

  -- Unfinished: 'Preparing' + 'New' today; completed, cancelled and the other
  -- tenant's order are excluded, and none of them change completed sales.
  if (insight->>'unfinished_order_count')::integer <> 2 then
    raise exception 'Unfinished order count is incorrect: %', insight;
  end if;

  -- Checkout contact capture ignores the staff-entered order.
  if (morning->>'checkout_order_count')::integer <> 2
     or (morning->>'checkout_contact_count')::integer <> 2
     or (morning->>'contact_count')::integer <> 2 then
    raise exception 'Checkout contact counts are incorrect: %', morning;
  end if;

  if jsonb_array_length(insight->'location_insights') <> 1 then
    raise exception 'Location privacy threshold or aggregation is incorrect';
  end if;

  owner_report := public.daily_owner_report_insights(
    '26000000-0000-0000-0000-000000000001',
    '2026-07-13'::date
  );

  if jsonb_array_length(owner_report->'top_items') <> 3
     or (owner_report->'top_items'->0->>'name') <> 'Karak Tea'
     or (owner_report->'top_items'->0->>'qty')::numeric <> 3 then
    raise exception 'Owner report top items are incorrect: %', owner_report;
  end if;

  if (owner_report->'payment_breakdown'->'Cash on Delivery'->>'orders')::integer <> 3
     or (owner_report->'payment_breakdown'->'Cash on Delivery'->>'sales')::numeric <> 35
     or (owner_report->'payment_breakdown'->'Card on Delivery'->>'orders')::integer <> 1 then
    raise exception 'Owner report payment mix is incorrect: %', owner_report;
  end if;
end;
$daily_coach_checks$;

rollback;
