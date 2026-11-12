-- Rollback-only integration checks for the compact performance snapshots.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at)
values ('1a000000-0000-0000-0000-000000000001', 'snapshot@test.invalid',
  'authenticated', 'authenticated', now(), now());

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active)
values
  ('2a000000-0000-0000-0000-000000000001', 'Snapshot tenant',
    'snapshot-tenant', '971500000101', 'live', true),
  ('2a000000-0000-0000-0000-000000000002', 'Other tenant',
    'snapshot-other', '971500000102', 'live', true);

insert into public.restaurant_users (restaurant_id, user_id, email, role, accepted_at)
values ('2a000000-0000-0000-0000-000000000001',
  '1a000000-0000-0000-0000-000000000001', 'snapshot@test.invalid', 'manager', now());
-- Dates below are restaurant business dates (restaurants.time_zone), matching the
-- functions under test; the session's current_date can differ by a day.
select (now() at time zone time_zone)::date as business_today
from public.restaurants where id = '2a000000-0000-0000-0000-000000000001' \gset

insert into public.menu_categories (id, restaurant_id, name, is_active, display_order)
values
  ('3a000000-0000-0000-0000-000000000001',
    '2a000000-0000-0000-0000-000000000001', 'Visible category', true, 1),
  ('3a000000-0000-0000-0000-000000000002',
    '2a000000-0000-0000-0000-000000000001', 'Inactive category', false, 2),
  ('3a000000-0000-0000-0000-000000000003',
    '2a000000-0000-0000-0000-000000000002', 'Other category', true, 1);

insert into public.menu_items (id, restaurant_id, category_id, name, price, is_available)
values
  ('4a000000-0000-0000-0000-000000000001',
    '2a000000-0000-0000-0000-000000000001',
    '3a000000-0000-0000-0000-000000000001', 'Tenant item', 10, true),
  ('4a000000-0000-0000-0000-000000000002',
    '2a000000-0000-0000-0000-000000000002',
    '3a000000-0000-0000-0000-000000000003', 'Other item', 20, true);

insert into public.customers (
  id, restaurant_id, name, phone, delivery_area, delivery_address
) values (
  '5a000000-0000-0000-0000-000000000001',
  '2a000000-0000-0000-0000-000000000001', 'Credit snapshot',
  '971500000103', '', ''
);

insert into public.customer_credit_accounts (
  id, restaurant_id, customer_id, credit_limit, terms_days
) values (
  '6a000000-0000-0000-0000-000000000001',
  '2a000000-0000-0000-0000-000000000001',
  '5a000000-0000-0000-0000-000000000001', 100, 7
);

insert into public.customer_credit_entries (
  restaurant_id, account_id, entry_type, amount, due_date, payment_method, note
) values
  ('2a000000-0000-0000-0000-000000000001',
    '6a000000-0000-0000-0000-000000000001', 'adjustment', 20,
    :'business_today'::date - 1, null, 'Past due charge'),
  ('2a000000-0000-0000-0000-000000000001',
    '6a000000-0000-0000-0000-000000000001', 'adjustment', 10,
    :'business_today'::date + 1, null, 'Future charge'),
  ('2a000000-0000-0000-0000-000000000001',
    '6a000000-0000-0000-0000-000000000001', 'payment', -5,
    null, 'cash', 'Part payment');

insert into public.subscriptions (
  restaurant_id, plan_id, status, billing_cycle_start, billing_cycle_end
) select
  '2a000000-0000-0000-0000-000000000001',
  plan.id, 'active', :'business_today', :'business_today'::date + 30
from public.plans plan
where plan.code = 'starter'
limit 1;

do $performance_snapshot_checks$
declare
  value jsonb;
begin
  value := public.get_admin_menu_snapshot(
    '2a000000-0000-0000-0000-000000000001'
  );
  if jsonb_array_length(value->'categories') <> 1
    or jsonb_array_length(value->'items') <> 1
    or value->'items'->0->>'name' <> 'Tenant item' then
    raise exception 'Admin menu snapshot is incomplete or crossed tenants';
  end if;

  value := public.get_restaurant_admin_session_snapshot(
    '1a000000-0000-0000-0000-000000000001', null
  );
  if (value->>'membership_count')::integer <> 1
    or value->'membership'->>'restaurant_id'
      <> '2a000000-0000-0000-0000-000000000001'
    or value->'restaurant'->>'slug' <> 'snapshot-tenant' then
    raise exception 'Restaurant session snapshot is incorrect';
  end if;

  value := public.get_tenant_access_snapshot(
    '2a000000-0000-0000-0000-000000000001'
  );
  if value->'subscription'->>'status' <> 'active'
    or value->'plan'->>'code' <> 'starter' then
    raise exception 'Tenant access snapshot is incorrect';
  end if;

  value := public.get_customer_credit_snapshots(
    '2a000000-0000-0000-0000-000000000001',
    array['5a000000-0000-0000-0000-000000000001'::uuid],
    '{}'::text[], false, 25
  );
  if jsonb_array_length(value) <> 1
    or (value->0->>'balance')::numeric <> 25
    or (value->0->>'overdue')::numeric <> 15
    or (value->0->>'available')::numeric <> 75 then
    raise exception 'Customer credit snapshot totals are incorrect: %', value;
  end if;
end;
$performance_snapshot_checks$;

rollback;
