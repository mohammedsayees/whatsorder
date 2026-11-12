\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at) values
  ('1c000000-0000-0000-0000-000000000001', 'cost-owner@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('1c000000-0000-0000-0000-000000000002', 'cost-manager@test.invalid', 'authenticated', 'authenticated', now(), now());
insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active, finance_enabled) values
  ('2c000000-0000-0000-0000-000000000001', 'Cost A', 'cost-a', '971500000091', 'live', true, true),
  ('2c000000-0000-0000-0000-000000000002', 'Cost B', 'cost-b', '971500000092', 'live', true, true);
insert into public.restaurant_users (restaurant_id, user_id, email, role, accepted_at) values
  ('2c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000001', 'cost-owner@test.invalid', 'owner', now()),
  ('2c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000002', 'cost-manager@test.invalid', 'manager', now());
-- Dates below are restaurant business dates (restaurants.time_zone), matching the
-- functions under test; the session's current_date can differ by a day.
select (now() at time zone time_zone)::date as business_today
from public.restaurants where id = '2c000000-0000-0000-0000-000000000001' \gset

set local role service_role;
update public.finance_role_permissions set can_manage_costing = true, can_view_reports = true
where restaurant_id = '2c000000-0000-0000-0000-000000000001' and role = 'manager';
insert into public.menu_categories (id, restaurant_id, name) values
  ('3c000000-0000-0000-0000-000000000001', '2c000000-0000-0000-0000-000000000001', 'Food');
insert into public.menu_items (id, restaurant_id, category_id, name, price) values
  ('4c000000-0000-0000-0000-000000000001', '2c000000-0000-0000-0000-000000000001', '3c000000-0000-0000-0000-000000000001', 'Beef wrap', 18),
  ('4c000000-0000-0000-0000-000000000002', '2c000000-0000-0000-0000-000000000001', '3c000000-0000-0000-0000-000000000001', 'Unknown plate', 20);
insert into public.finance_ingredients (
  id, restaurant_id, name, canonical_unit, yield_pct, created_by, updated_by
) values (
  '5c000000-0000-0000-0000-000000000001', '2c000000-0000-0000-0000-000000000001',
  'Beef', 'g', 90, '1c000000-0000-0000-0000-000000000001', '1c000000-0000-0000-0000-000000000001'
);
select public.confirm_finance_purchase_price(
  '2c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', null,
  'Supplier', :'business_today', 2, 1, 'kg', 3600, '1c000000-0000-0000-0000-000000000001'
);
select public.create_finance_recipe_revision(
  '2c000000-0000-0000-0000-000000000001', '4c000000-0000-0000-0000-000000000001', null,
  :'business_today', '[{"ingredient_id":"5c000000-0000-0000-0000-000000000001","canonical_quantity":150,"waste_pct":10}]',
  '1c000000-0000-0000-0000-000000000001'
);
insert into public.orders (
  id, restaurant_id, customer_name, customer_phone, fulfilment_type, payment_method,
  items, subtotal, delivery_fee, total, status, whatsapp_message,
  consent_order_processing, consent_timestamp
) values (
  '6c000000-0000-0000-0000-000000000001', '2c000000-0000-0000-0000-000000000001',
  'Cost test', '971500000093', 'takeaway', 'Cash on Delivery',
  '[{"item_id":"4c000000-0000-0000-0000-000000000001","name":"Beef wrap","price":18,"quantity":2}]',
  36, 0, 36, 'Completed', 'test', true, now()
), (
  '6c000000-0000-0000-0000-000000000002', '2c000000-0000-0000-0000-000000000001',
  'Missing test', '971500000094', 'takeaway', 'Cash on Delivery',
  '[{"item_id":"4c000000-0000-0000-0000-000000000002","name":"Unknown plate","price":20,"quantity":1}]',
  20, 0, 20, 'Completed', 'test', true, now()
);

do $snapshot_checks$
begin
  if not exists (
    select 1 from public.finance_product_cost_snapshots
    where order_id = '6c000000-0000-0000-0000-000000000001'
      and completeness = 'complete' and unit_direct_cost_fils = 330
      and total_direct_cost_fils = 660 and line_revenue_fils = 3600
  ) then raise exception 'Completed order did not receive exact immutable recipe cost'; end if;
  if not exists (
    select 1 from public.finance_product_cost_snapshots
    where order_id = '6c000000-0000-0000-0000-000000000002'
      and completeness = 'missing_recipe' and total_direct_cost_fils is null
  ) then raise exception 'Missing recipe was treated as zero or complete'; end if;
  if public.snapshot_finance_order_costs(
    '2c000000-0000-0000-0000-000000000001', '6c000000-0000-0000-0000-000000000001', false
  ) <> 0 then raise exception 'Snapshot retry was not idempotent'; end if;
end;
$snapshot_checks$;

insert into public.menu_option_groups (id, restaurant_id, name, min_select, max_select) values
  ('7c000000-0000-0000-0000-000000000001', '2c000000-0000-0000-0000-000000000001', 'Extra', 0, 1);
insert into public.menu_options (id, restaurant_id, group_id, name, price_delta) values
  ('8c000000-0000-0000-0000-000000000001', '2c000000-0000-0000-0000-000000000001',
   '7c000000-0000-0000-0000-000000000001', 'Extra beef', 3);
insert into public.menu_item_option_groups (restaurant_id, menu_item_id, group_id) values
  ('2c000000-0000-0000-0000-000000000001', '4c000000-0000-0000-0000-000000000001',
   '7c000000-0000-0000-0000-000000000001');
select public.confirm_finance_purchase_price(
  '2c000000-0000-0000-0000-000000000001', '5c000000-0000-0000-0000-000000000001', null,
  'Supplier two', :'business_today', 1, 1, 'kg', 900, '1c000000-0000-0000-0000-000000000001'
);
select public.create_finance_recipe_revision(
  '2c000000-0000-0000-0000-000000000001', '4c000000-0000-0000-0000-000000000001',
  '8c000000-0000-0000-0000-000000000001', :'business_today',
  '[{"ingredient_id":"5c000000-0000-0000-0000-000000000001","canonical_quantity":30,"waste_pct":0}]',
  '1c000000-0000-0000-0000-000000000001'
);
update public.finance_settings set cost_basis = 'weighted_average'
where restaurant_id = '2c000000-0000-0000-0000-000000000001';
insert into public.orders (
  id, restaurant_id, customer_name, customer_phone, fulfilment_type, payment_method,
  items, subtotal, delivery_fee, total, status, whatsapp_message,
  consent_order_processing, consent_timestamp
) values (
  '6c000000-0000-0000-0000-000000000003', '2c000000-0000-0000-0000-000000000001',
  'Option cost test', '971500000101', 'takeaway', 'Cash on Delivery',
  '[{"item_id":"4c000000-0000-0000-0000-000000000001","name":"Beef wrap","price":21,"quantity":1,"options":[{"option_id":"8c000000-0000-0000-0000-000000000001","name":"Extra beef"}]}]',
  21, 0, 21, 'Completed', 'test', true, now()
);
do $weighted_option_checks$
begin
  if not exists (select 1 from public.finance_product_cost_snapshots
    where order_id = '6c000000-0000-0000-0000-000000000003'
      and completeness = 'complete' and unit_direct_cost_fils = 325
      and jsonb_array_length(cost_basis_revision) = 2
      and cost_basis_revision @> '[{"menu_option_id":"8c000000-0000-0000-0000-000000000001"}]') then
    raise exception 'Weighted-average option recipe cost or traceability was incorrect';
  end if;
end;
$weighted_option_checks$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '1c000000-0000-0000-0000-000000000002', true);
do $rls_checks$
begin
  if (select count(*) from public.finance_ingredients) <> 1 then
    raise exception 'Costing manager tenant read failed';
  end if;
  begin
    insert into public.finance_ingredients (restaurant_id, name, canonical_unit)
    values ('2c000000-0000-0000-0000-000000000001', 'Unauthorized', 'g');
    raise exception 'Authenticated costing write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('authenticated',
    'public.confirm_finance_purchase_price(uuid,uuid,uuid,text,date,numeric,numeric,text,bigint,uuid)', 'execute') then
    raise exception 'Purchase confirmation RPC exposed to authenticated role';
  end if;
end;
$rls_checks$;

rollback;
