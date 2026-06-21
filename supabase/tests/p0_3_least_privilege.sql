\set ON_ERROR_STOP on

-- P0-3 database integration test.
-- Run against an isolated database after applying the P0-3 migration.
-- Everything is rollback-only.

begin;

insert into auth.users (id, email, role, aud, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', 'staff@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'manager@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'owner@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('10000000-0000-0000-0000-000000000004', 'super@test.invalid', 'authenticated', 'authenticated', now(), now());

insert into public.restaurants (
  id, name, slug, whatsapp_number, status, is_active
)
values
  ('20000000-0000-0000-0000-000000000001', 'Tenant A', 'p0-tenant-a', '971500000001', 'live', true),
  ('20000000-0000-0000-0000-000000000002', 'Tenant B', 'p0-tenant-b', '971500000002', 'live', true);

insert into public.restaurant_users (
  id, restaurant_id, user_id, email, role, accepted_at
)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'staff@test.invalid', 'staff', now()),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'manager@test.invalid', 'manager', now()),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'owner@test.invalid', 'owner', now());

insert into public.profiles (id, email, role)
values ('10000000-0000-0000-0000-000000000004', 'super@test.invalid', 'super_admin');

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
  whatsapp_message,
  consent_order_processing,
  consent_timestamp
)
values
  (
    '40000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Tenant A Customer',
    '971500000011',
    'Cash on Delivery',
    '[]'::jsonb,
    10,
    0,
    10,
    'test',
    true,
    now()
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'Tenant B Customer',
    '971500000012',
    'Cash on Delivery',
    '[]'::jsonb,
    10,
    0,
    10,
    'test',
    true,
    now()
  );

insert into public.customers (
  id,
  restaurant_id,
  name,
  phone,
  delivery_area,
  delivery_address
)
values
  (
    '50000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'Tenant A Customer',
    '971500000011',
    'Test',
    'Test'
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'Tenant B Customer',
    '971500000012',
    'Test',
    'Test'
  );

insert into public.menu_categories (
  id, restaurant_id, name, is_active
)
values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Tenant A Menu', true),
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Tenant B Menu', true);

insert into public.menu_items (
  id,
  restaurant_id,
  category_id,
  name,
  price,
  is_available
)
values
  (
    '70000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '60000000-0000-0000-0000-000000000001',
    'Tenant A Item',
    10,
    true
  ),
  (
    '70000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    '60000000-0000-0000-0000-000000000002',
    'Tenant B Item',
    10,
    true
  );

-- Anonymous visitors can read active public menu data. They still cannot read
-- private restaurant or order base tables.
set local role anon;

do $anon_checks$
begin
  if (select count(*) from public.menu_items) <> 2 then
    raise exception 'Anon public menu SELECT failed';
  end if;

  begin
    perform id from public.restaurants limit 1;
    raise exception 'Anon private restaurant SELECT unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform id from public.orders limit 1;
    raise exception 'Anon private order SELECT unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$anon_checks$;

-- All browser identities use the authenticated database role. JWT subject and
-- membership role determine row visibility; table grants deny all mutations.
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

do $staff_checks$
begin
  if (select count(*) from public.orders) <> 1 then
    raise exception 'Staff must read exactly its own tenant order';
  end if;

  if (select count(*) from public.customers) <> 0 then
    raise exception 'Staff must not browse the customer CRM';
  end if;

  begin
    update public.orders
    set customer_name = 'unauthorized'
    where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'Staff direct order update unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;

  begin
    delete from public.orders
    where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'Staff direct order delete unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$staff_checks$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);

do $manager_checks$
begin
  if (select count(*) from public.orders) <> 1 then
    raise exception 'Manager must read exactly its own tenant order';
  end if;

  if (select count(*) from public.customers) <> 1 then
    raise exception 'Manager must read exactly its own tenant customer';
  end if;

  begin
    update public.customers
    set name = 'unauthorized'
    where id = '50000000-0000-0000-0000-000000000001';
    raise exception 'Manager direct customer update unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$manager_checks$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000003',
  true
);

do $owner_checks$
begin
  if (select count(*) from public.orders) <> 1 then
    raise exception 'Owner must read exactly its own tenant order';
  end if;

  begin
    update public.restaurants
    set name = 'unauthorized'
    where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'Owner direct restaurant update unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$owner_checks$;

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000004',
  true
);

do $super_admin_checks$
begin
  if (select count(*) from public.orders) <> 2 then
    raise exception 'Super Admin must read orders across tenants';
  end if;

  begin
    update public.orders
    set customer_name = 'unauthorized'
    where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'Super Admin direct order update unexpectedly succeeded';
  exception
    when insufficient_privilege then null;
  end;
end;
$super_admin_checks$;

-- Server actions use service_role. Verify direct writes and the P1 operational
-- RPCs remain executable after browser-role privileges are removed.
reset role;
set local role service_role;

update public.orders
set customer_name = 'service role write'
where id = '40000000-0000-0000-0000-000000000001';

select public.transition_order_status_and_record_event(
  '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'Accepted',
  null,
  'integration_test',
  'p0_3_test'
);

select public.record_order_print_event(
  '20000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'kot',
  null,
  'integration_test',
  'test-device',
  false
);

reset role;

do $catalog_checks$
declare
  sensitive_table text;
begin
  foreach sensitive_table in array array[
    'public.restaurants',
    'public.menu_categories',
    'public.menu_items',
    'public.menu_offers',
    'public.orders',
    'public.customers',
    'public.loyalty_transactions',
    'public.customer_feedback',
    'public.restaurant_users'
  ]
  loop
    if has_table_privilege('authenticated', sensitive_table, 'INSERT')
       or has_table_privilege('authenticated', sensitive_table, 'UPDATE')
       or has_table_privilege('authenticated', sensitive_table, 'DELETE') then
      raise exception 'Authenticated mutation privilege remains on %', sensitive_table;
    end if;
  end loop;

  if not has_table_privilege('authenticated', 'public.orders', 'SELECT') then
    raise exception 'Realtime order SELECT privilege was removed';
  end if;

  if not has_function_privilege(
    'anon',
    'public.is_restaurant_member(uuid,text[])',
    'EXECUTE'
  ) or not has_function_privilege(
    'anon',
    'public.is_super_admin()',
    'EXECUTE'
  ) then
    raise exception 'Anon cannot evaluate public menu policy helpers';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.transition_order_status_and_record_event(uuid,uuid,text,uuid,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Service role lost status transition RPC access';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.record_order_print_event(uuid,uuid,text,uuid,text,text,boolean)',
    'EXECUTE'
  ) then
    raise exception 'Service role lost print RPC access';
  end if;
end;
$catalog_checks$;

rollback;
