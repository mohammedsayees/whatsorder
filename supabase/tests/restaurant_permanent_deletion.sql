-- Rollback-only checks for permanent restaurant deletion. Run after all
-- migrations. Seeds one café with interlinked data (customers, credit
-- accounts and entries, a shift, parent and add-on orders, menu with a size
-- group, billing) plus a second café that must be left untouched.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at)
values ('1d000000-0000-0000-0000-000000000001', 'delete-owner@test.invalid',
  'authenticated', 'authenticated', now(), now());

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active)
values
  ('2d000000-0000-0000-0000-000000000001', 'Delete Me Cafe', 'delete-me-cafe',
    '971500000301', 'live', true),
  ('2d000000-0000-0000-0000-000000000002', 'Keep Me Cafe', 'keep-me-cafe',
    '971500000302', 'live', true);

insert into public.restaurant_users (restaurant_id, user_id, email, role, accepted_at)
values ('2d000000-0000-0000-0000-000000000001', '1d000000-0000-0000-0000-000000000001',
  'delete-owner@test.invalid', 'manager', now());

insert into public.restaurant_shifts (id, restaurant_id, shift_name, opening_cash_amount, opened_by_user_id)
values ('8d000000-0000-0000-0000-000000000001', '2d000000-0000-0000-0000-000000000001',
  'Delete shift', 0, '1d000000-0000-0000-0000-000000000001');

insert into public.customers (
  id, restaurant_id, name, phone, delivery_area, delivery_address,
  consent_order_processing, consent_timestamp
) values
  ('5d000000-0000-0000-0000-000000000001', '2d000000-0000-0000-0000-000000000001',
    'Delete Customer', '971500000303', '', '', true, now()),
  ('5d000000-0000-0000-0000-000000000002', '2d000000-0000-0000-0000-000000000002',
    'Keep Customer', '971500000304', '', '', true, now());

select public.configure_customer_credit_account(
  '2d000000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001',
  true, 500, 7, true, 0, '1d000000-0000-0000-0000-000000000001'
);

insert into public.orders (
  id, restaurant_id, customer_id, customer_name, customer_phone, fulfilment_type,
  payment_method, items, subtotal, delivery_fee, total, status,
  whatsapp_message, consent_order_processing, consent_timestamp
) values
  ('4d000000-0000-0000-0000-000000000001', '2d000000-0000-0000-0000-000000000001',
    '5d000000-0000-0000-0000-000000000001', 'Delete Customer', '971500000303', 'takeaway', null,
    '[{"item_id":"tea","name":"Tea","price":10,"quantity":1}]', 10, 0, 10, 'Preparing',
    'test', true, now()),
  ('4d000000-0000-0000-0000-000000000009', '2d000000-0000-0000-0000-000000000002',
    '5d000000-0000-0000-0000-000000000002', 'Keep Customer', '971500000304', 'takeaway', null,
    '[{"item_id":"tea","name":"Tea","price":10,"quantity":1}]', 10, 0, 10, 'Preparing',
    'test', true, now());

insert into public.orders (
  id, restaurant_id, parent_order_id, customer_name, customer_phone, fulfilment_type,
  payment_method, items, subtotal, delivery_fee, total, status,
  whatsapp_message, consent_order_processing, consent_timestamp
) values (
  '4d000000-0000-0000-0000-000000000002', '2d000000-0000-0000-0000-000000000001',
  '4d000000-0000-0000-0000-000000000001', 'Delete Customer', '971500000303', 'takeaway', null,
  '[{"item_id":"tea","name":"Tea","price":1,"quantity":1}]', 1, 0, 1, 'Preparing',
  'add-on', true, now()
);

select public.record_customer_credit_order(
  '2d000000-0000-0000-0000-000000000001', '4d000000-0000-0000-0000-000000000001',
  '1d000000-0000-0000-0000-000000000001'
);

update public.restaurants
set activation_order_id = '4d000000-0000-0000-0000-000000000001', activated_at = now()
where id = '2d000000-0000-0000-0000-000000000001';

insert into public.menu_categories (id, restaurant_id, name, display_order, is_active)
values ('3d000000-0000-0000-0000-000000000001', '2d000000-0000-0000-0000-000000000001', 'Drinks', 1, true);
insert into public.menu_items (id, restaurant_id, category_id, name, price, is_available)
values ('6d000000-0000-0000-0000-000000000001', '2d000000-0000-0000-0000-000000000001',
  '3d000000-0000-0000-0000-000000000001', 'Karak Tea', 2, true);
insert into public.menu_option_groups (id, restaurant_id, name, min_select, max_select)
values ('7d000000-0000-0000-0000-000000000001', '2d000000-0000-0000-0000-000000000001', 'Size', 1, 1);
insert into public.menu_options (restaurant_id, group_id, name, price_delta)
values ('2d000000-0000-0000-0000-000000000001', '7d000000-0000-0000-0000-000000000001', 'Large', 1);
insert into public.menu_item_option_groups (restaurant_id, menu_item_id, group_id)
values ('2d000000-0000-0000-0000-000000000001', '6d000000-0000-0000-0000-000000000001',
  '7d000000-0000-0000-0000-000000000001');

insert into public.subscriptions (restaurant_id, plan_id, status, billing_cycle_start, billing_cycle_end)
select '2d000000-0000-0000-0000-000000000001', plan.id, 'active', current_date, current_date + 30
from public.plans plan where plan.code = 'starter' limit 1;

insert into public.onboarding_tasks (restaurant_id, task_key, task_label, is_completed)
values ('2d000000-0000-0000-0000-000000000001', 'items_added', 'Items added', true);

do $restaurant_permanent_deletion_test$
declare
  target uuid := '2d000000-0000-0000-0000-000000000001';
  keeper uuid := '2d000000-0000-0000-0000-000000000002';
  result jsonb;
  exported jsonb;
  rejected boolean;
  owned_table text;
  leftover integer;
begin
  -- Only the service role may call these.
  if has_function_privilege('anon', 'public.delete_restaurant_permanently(uuid,text,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.delete_restaurant_permanently(uuid,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.export_restaurant_data(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.export_restaurant_data(uuid)', 'execute') then
    raise exception 'Browser roles can call restaurant deletion or export';
  end if;
  if has_table_privilege('anon', 'public.restaurant_deletions', 'select')
     or has_table_privilege('authenticated', 'public.restaurant_deletions', 'select') then
    raise exception 'Browser roles can read the restaurant deletion audit';
  end if;

  -- Export includes the restaurant's own rows and nothing from other cafés.
  exported := public.export_restaurant_data(target);
  if jsonb_array_length(exported -> 'tables' -> 'orders') <> 2
     or jsonb_array_length(exported -> 'tables' -> 'customers') <> 1
     or exported -> 'restaurant' ->> 'slug' <> 'delete-me-cafe' then
    raise exception 'Export is incomplete or crosses tenants: %', exported -> 'tables' -> 'orders';
  end if;

  -- Outside a purge the credit ledger stays append-only, even for this café.
  if not exists (select 1 from public.customer_credit_entries where restaurant_id = target) then
    raise exception 'Seed did not create a credit ledger entry';
  end if;
  rejected := false;
  begin
    delete from public.customer_credit_entries where restaurant_id = target;
  exception when others then
    rejected := sqlerrm = 'Customer credit ledger entries are immutable';
  end;
  if not rejected then
    raise exception 'Credit ledger entries could be deleted outside a purge';
  end if;

  -- Refused while the restaurant is not cancelled.
  rejected := false;
  begin
    perform public.delete_restaurant_permanently(target, 'delete-me-cafe', '1d000000-0000-0000-0000-000000000001');
  exception when others then
    rejected := sqlerrm = 'Only a cancelled restaurant can be deleted';
  end;
  if not rejected then
    raise exception 'A non-cancelled restaurant was deleted';
  end if;

  update public.restaurants set status = 'cancelled', is_active = false where id = target;

  -- Refused when the typed store link does not match.
  rejected := false;
  begin
    perform public.delete_restaurant_permanently(target, 'keep-me-cafe', '1d000000-0000-0000-0000-000000000001');
  exception when others then
    rejected := sqlerrm = 'The confirmation does not match the store link';
  end;
  if not rejected then
    raise exception 'Deletion ran with a mismatched confirmation';
  end if;

  result := public.delete_restaurant_permanently(target, 'delete-me-cafe', '1d000000-0000-0000-0000-000000000001');

  if (result ->> 'orders')::int <> 2 or (result ->> 'customers')::int <> 1 then
    raise exception 'Unexpected deletion summary: %', result;
  end if;

  if exists (select 1 from public.restaurants where id = target) then
    raise exception 'The restaurant row still exists';
  end if;

  foreach owned_table in array public.restaurant_owned_tables() loop
    execute format('select count(*) from public.%I where restaurant_id = $1', owned_table)
    into leftover using target;
    if leftover <> 0 then
      raise exception 'Table % still holds % rows for the deleted restaurant', owned_table, leftover;
    end if;
  end loop;

  -- The other café is untouched.
  if not exists (select 1 from public.restaurants where id = keeper)
     or not exists (select 1 from public.orders where id = '4d000000-0000-0000-0000-000000000009')
     or not exists (select 1 from public.customers where id = '5d000000-0000-0000-0000-000000000002') then
    raise exception 'Deleting one restaurant touched another';
  end if;

  -- Audit row kept, with billing copied and no customer personal data.
  if not exists (
    select 1 from public.restaurant_deletions
    where deleted_restaurant_id = target
      and restaurant_slug = 'delete-me-cafe'
      and deleted_by = '1d000000-0000-0000-0000-000000000001'
      and jsonb_array_length(billing_snapshot -> 'subscriptions') = 1
  ) then
    raise exception 'Deletion audit record is missing or incomplete';
  end if;
  if exists (
    select 1 from public.restaurant_deletions
    where deleted_restaurant_id = target
      and (summary::text like '%971500000303%' or billing_snapshot::text like '%971500000303%')
  ) then
    raise exception 'Deletion audit copied customer personal data';
  end if;
end
$restaurant_permanent_deletion_test$;

rollback;
