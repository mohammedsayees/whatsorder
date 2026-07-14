-- Rollback-only integration checks for order additions.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at)
values (
  '13000000-0000-0000-0000-000000000001',
  'addition-staff@test.invalid',
  'authenticated',
  'authenticated',
  now(),
  now()
);

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active)
values
  ('23000000-0000-0000-0000-000000000001', 'Addition Tenant A', 'addition-a', '971500000041', 'live', true),
  ('23000000-0000-0000-0000-000000000002', 'Addition Tenant B', 'addition-b', '971500000042', 'live', true);

insert into public.restaurant_users (
  id, restaurant_id, user_id, email, role, accepted_at
)
values (
  '33000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  '13000000-0000-0000-0000-000000000001',
  'addition-staff@test.invalid',
  'staff',
  now()
);

insert into public.restaurant_shifts (
  id, restaurant_id, shift_name, opening_cash_amount, opened_by_user_id
)
values (
  '83000000-0000-0000-0000-000000000001',
  '23000000-0000-0000-0000-000000000001',
  'Addition shift',
  0,
  '13000000-0000-0000-0000-000000000001'
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
  whatsapp_message,
  consent_order_processing,
  consent_timestamp
)
values
  (
    '43000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'Unpaid customer',
    '971500000051',
    'dine_in',
    '7',
    null,
    '[{"item_id":"tea","offer_id":"tea-deal","offer_max_quantity":1,"name":"Tea","price":5,"quantity":1}]'::jsonb,
    5,
    0,
    5,
    'Preparing',
    'test',
    true,
    now()
  ),
  (
    '43000000-0000-0000-0000-000000000002',
    '23000000-0000-0000-0000-000000000001',
    'Paid customer',
    '971500000052',
    'dine_in',
    '8',
    'Cash on Delivery',
    '[{"item_id":"tea","name":"Tea","price":5,"quantity":1}]'::jsonb,
    5,
    0,
    5,
    'Preparing',
    'test',
    true,
    now()
  );

do $addition_checks$
declare
  amended_result jsonb;
  replay_result jsonb;
  add_on_result jsonb;
  add_on_id uuid;
begin
  amended_result := public.add_items_to_restaurant_order(
    '23000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    '[{"item_id":"cake","name":"Cake","price":10,"quantity":1}]'::jsonb,
    10,
    null,
    '13000000-0000-0000-0000-000000000001',
    'staff'
  );

  if amended_result->>'mode' <> 'amended' then
    raise exception 'Unpaid order was not amended';
  end if;

  if not exists (
    select 1
    from public.orders
    where id = '43000000-0000-0000-0000-000000000001'
      and restaurant_id = '23000000-0000-0000-0000-000000000001'
      and jsonb_array_length(items) = 2
      and subtotal = 15
      and total = 15
  ) then
    raise exception 'Unpaid order totals or items were not updated';
  end if;

  replay_result := public.add_items_to_restaurant_order(
    '23000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000001',
    '93000000-0000-0000-0000-000000000001',
    '[{"item_id":"cake","name":"Cake","price":10,"quantity":1}]'::jsonb,
    10,
    null,
    '13000000-0000-0000-0000-000000000001',
    'staff'
  );

  if replay_result->>'mode' <> 'amended'
     or (
       select jsonb_array_length(items)
       from public.orders
       where id = '43000000-0000-0000-0000-000000000001'
     ) <> 2 then
    raise exception 'Idempotent amendment replay duplicated items';
  end if;

  begin
    perform public.add_items_to_restaurant_order(
      '23000000-0000-0000-0000-000000000001',
      '43000000-0000-0000-0000-000000000001',
      '93000000-0000-0000-0000-000000000004',
      '[{"item_id":"tea","offer_id":"tea-deal","offer_max_quantity":1,"name":"Tea","price":5,"quantity":1}]'::jsonb,
      5,
      null,
      '13000000-0000-0000-0000-000000000001',
      'staff'
    );
    raise exception 'Combined offer cap unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%Offer quantity limit exceeded%' then
        raise;
      end if;
  end;

  add_on_result := public.add_items_to_restaurant_order(
    '23000000-0000-0000-0000-000000000001',
    '43000000-0000-0000-0000-000000000002',
    '93000000-0000-0000-0000-000000000002',
    '[{"item_id":"cake","name":"Cake","price":10,"quantity":1}]'::jsonb,
    10,
    'extra plate',
    '13000000-0000-0000-0000-000000000001',
    'staff'
  );

  if add_on_result->>'mode' <> 'add_on' then
    raise exception 'Paid order did not create an add-on';
  end if;

  add_on_id := (add_on_result->'order'->>'id')::uuid;

  if not exists (
    select 1
    from public.orders
    where id = add_on_id
      and restaurant_id = '23000000-0000-0000-0000-000000000001'
      and parent_order_id = '43000000-0000-0000-0000-000000000002'
      and payment_method is null
      and delivery_fee = 0
      and total = 10
      and status = 'Preparing'
      and shift_id = '83000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Separate add-on order was not created correctly';
  end if;

  if (
    select count(*)
    from public.order_item_addition_events
    where restaurant_id = '23000000-0000-0000-0000-000000000001'
  ) <> 2 then
    raise exception 'Addition audit events are incomplete or duplicated';
  end if;
end;
$addition_checks$;

do $tenant_boundary$
begin
  begin
    perform public.add_items_to_restaurant_order(
      '23000000-0000-0000-0000-000000000002',
      '43000000-0000-0000-0000-000000000001',
      '93000000-0000-0000-0000-000000000003',
      '[{"item_id":"cake","name":"Cake","price":10,"quantity":1}]'::jsonb,
      10,
      null,
      '13000000-0000-0000-0000-000000000001',
      'staff'
    );
    raise exception 'Cross-tenant order addition unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%Order not found%' then
        raise;
      end if;
  end;
end;
$tenant_boundary$;

rollback;
