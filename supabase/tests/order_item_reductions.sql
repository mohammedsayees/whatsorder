-- Rollback-only integration checks for audited KOT item reductions.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at)
values (
  '14000000-0000-0000-0000-000000000001',
  'reduction-staff@test.invalid',
  'authenticated',
  'authenticated',
  now(),
  now()
);

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active)
values
  ('24000000-0000-0000-0000-000000000001', 'Reduction Tenant A', 'reduction-a', '971500000061', 'live', true),
  ('24000000-0000-0000-0000-000000000002', 'Reduction Tenant B', 'reduction-b', '971500000062', 'live', true);

insert into public.restaurant_users (
  id, restaurant_id, user_id, email, role, accepted_at
)
values (
  '34000000-0000-0000-0000-000000000001',
  '24000000-0000-0000-0000-000000000001',
  '14000000-0000-0000-0000-000000000001',
  'reduction-staff@test.invalid',
  'staff',
  now()
);

insert into public.orders (
  id,
  restaurant_id,
  customer_name,
  customer_phone,
  fulfilment_type,
  table_number,
  payment_method,
  items,
  subtotal,
  delivery_fee,
  total,
  status,
  source,
  whatsapp_message,
  consent_order_processing,
  consent_timestamp
)
values
  (
    '44000000-0000-0000-0000-000000000001',
    '24000000-0000-0000-0000-000000000001',
    'Unpaid customer',
    '971500000071',
    'dine_in',
    '12',
    null,
    '[{"item_id":"tea","name":"Tea","price":5,"quantity":2},{"item_id":"cake","name":"Cake","price":10,"quantity":1}]'::jsonb,
    20,
    0,
    20,
    'Preparing',
    'staff',
    'test',
    true,
    now()
  ),
  (
    '44000000-0000-0000-0000-000000000002',
    '24000000-0000-0000-0000-000000000001',
    'Paid customer',
    '971500000072',
    'dine_in',
    '13',
    'Cash on Delivery',
    '[{"item_id":"tea","name":"Tea","price":5,"quantity":2}]'::jsonb,
    10,
    0,
    10,
    'Preparing',
    'staff',
    'test',
    true,
    now()
  );

do $reduction_checks$
declare
  original_items jsonb := '[{"item_id":"tea","name":"Tea","price":5,"quantity":2},{"item_id":"cake","name":"Cake","price":10,"quantity":1}]'::jsonb;
  result jsonb;
  replay jsonb;
begin
  result := public.reduce_restaurant_order_items(
    '24000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000001',
    '94000000-0000-0000-0000-000000000001',
    original_items,
    '[{"line_index":0,"quantity":1}]'::jsonb,
    'Customer changed mind',
    '14000000-0000-0000-0000-000000000001',
    'staff'
  );

  if result->'removed_items'->0->>'quantity' <> '1' then
    raise exception 'Removed quantity was not returned';
  end if;

  if not exists (
    select 1
    from public.orders
    where id = '44000000-0000-0000-0000-000000000001'
      and restaurant_id = '24000000-0000-0000-0000-000000000001'
      and items->0->>'quantity' = '1'
      and jsonb_array_length(items) = 2
      and subtotal = 15
      and total = 15
  ) then
    raise exception 'Order items or totals were not reduced correctly';
  end if;

  replay := public.reduce_restaurant_order_items(
    '24000000-0000-0000-0000-000000000001',
    '44000000-0000-0000-0000-000000000001',
    '94000000-0000-0000-0000-000000000001',
    original_items,
    '[{"line_index":0,"quantity":1}]'::jsonb,
    'Customer changed mind',
    '14000000-0000-0000-0000-000000000001',
    'staff'
  );

  if replay->'order'->>'total' <> '15.00'
     or (select count(*) from public.order_item_reduction_events
         where client_order_id = '94000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'Idempotent replay changed the order twice';
  end if;

  begin
    perform public.reduce_restaurant_order_items(
      '24000000-0000-0000-0000-000000000001',
      '44000000-0000-0000-0000-000000000001',
      '94000000-0000-0000-0000-000000000002',
      original_items,
      '[{"line_index":0,"quantity":1}]'::jsonb,
      'Stale request',
      '14000000-0000-0000-0000-000000000001',
      'staff'
    );
    raise exception 'Stale reduction unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%order items changed%' then raise; end if;
  end;

  begin
    perform public.reduce_restaurant_order_items(
      '24000000-0000-0000-0000-000000000001',
      '44000000-0000-0000-0000-000000000002',
      '94000000-0000-0000-0000-000000000003',
      '[{"item_id":"tea","name":"Tea","price":5,"quantity":2}]'::jsonb,
      '[{"line_index":0,"quantity":1}]'::jsonb,
      'Paid correction',
      '14000000-0000-0000-0000-000000000001',
      'staff'
    );
    raise exception 'Paid reduction unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%Paid orders require a refund%' then raise; end if;
  end;
end;
$reduction_checks$;

do $reduction_tenant_boundary$
begin
  begin
    perform public.reduce_restaurant_order_items(
      '24000000-0000-0000-0000-000000000002',
      '44000000-0000-0000-0000-000000000001',
      '94000000-0000-0000-0000-000000000004',
      '[{"item_id":"tea","name":"Tea","price":5,"quantity":1},{"item_id":"cake","name":"Cake","price":10,"quantity":1}]'::jsonb,
      '[{"line_index":0,"quantity":1}]'::jsonb,
      'Cross tenant request',
      '14000000-0000-0000-0000-000000000001',
      'staff'
    );
    raise exception 'Cross-tenant reduction unexpectedly succeeded';
  exception when others then
    if sqlerrm not like '%Order not found%' then raise; end if;
  end;
end;
$reduction_tenant_boundary$;

rollback;
