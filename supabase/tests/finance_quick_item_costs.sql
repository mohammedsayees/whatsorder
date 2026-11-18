\set ON_ERROR_STOP on
-- Rollback-only checks: quick food cost per menu item (Simple mode, release 2).
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at) values
  ('1a000000-0000-0000-0000-000000000001', 'quick-owner@test.invalid', 'authenticated', 'authenticated', now(), now());
insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active, finance_enabled, currency_code, time_zone) values
  ('2a000000-0000-0000-0000-000000000001', 'Quick Cost', 'quick-cost', '971500000201', 'live', true, true, 'AED', 'Asia/Dubai');
insert into public.restaurant_users (restaurant_id, user_id, email, role, accepted_at) values
  ('2a000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-000000000001', 'quick-owner@test.invalid', 'owner', now());
select (now() at time zone 'Asia/Dubai')::date as business_today \gset

set local role service_role;
insert into public.menu_categories (id, restaurant_id, name) values
  ('3a000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000001', 'Drinks');
insert into public.menu_items (id, restaurant_id, category_id, name, price) values
  ('4a000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', 'Karak', 3),
  ('4a000000-0000-0000-0000-000000000002', '2a000000-0000-0000-0000-000000000001', '3a000000-0000-0000-0000-000000000001', 'Full recipe tea', 5);
insert into public.menu_option_groups (id, restaurant_id, name, min_select, max_select) values
  ('5a000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000001', 'Extras', 0, 1);
insert into public.menu_options (id, restaurant_id, group_id, name, price_delta) values
  ('6a000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', 'Extra sugar', 0);
insert into public.menu_item_option_groups (restaurant_id, menu_item_id, group_id) values
  ('2a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001');
-- A real recipe for the second item.
insert into public.finance_ingredients (id, restaurant_id, name, canonical_unit, yield_pct) values
  ('7a000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000001', 'Tea leaves', 'g', 100);
select public.create_finance_recipe_revision('2a000000-0000-0000-0000-000000000001', '4a000000-0000-0000-0000-000000000002', null,
  :'business_today', '[{"ingredient_id":"7a000000-0000-0000-0000-000000000001","canonical_quantity":5,"waste_pct":0}]',
  '1a000000-0000-0000-0000-000000000001');

-- Orders completed before any cost was entered: one plain, one with an add-on.
insert into public.orders (
  id, restaurant_id, customer_name, customer_phone, fulfilment_type, payment_method,
  items, subtotal, delivery_fee, total, status, whatsapp_message, consent_order_processing, consent_timestamp
) values
  ('8a000000-0000-0000-0000-000000000001', '2a000000-0000-0000-0000-000000000001', 'A', '971500000202', 'takeaway', 'Cash on Delivery',
   '[{"item_id":"4a000000-0000-0000-0000-000000000001","name":"Karak","price":3,"quantity":2}]', 6, 0, 6, 'Completed', 'x', true, now()),
  ('8a000000-0000-0000-0000-000000000002', '2a000000-0000-0000-0000-000000000001', 'B', '971500000203', 'takeaway', 'Cash on Delivery',
   '[{"item_id":"4a000000-0000-0000-0000-000000000001","name":"Karak","price":3,"quantity":1,"options":[{"option_id":"6a000000-0000-0000-0000-000000000001","name":"Extra sugar"}]}]', 3, 0, 3, 'Completed', 'x', true, now());

do $quick$
declare
  r constant uuid := '2a000000-0000-0000-0000-000000000001';
  owner_id constant uuid := '1a000000-0000-0000-0000-000000000001';
  karak constant uuid := '4a000000-0000-0000-0000-000000000001';
  result jsonb;
begin
  if exists (select 1 from public.finance_product_cost_snapshots where order_id = '8a000000-0000-0000-0000-000000000001' and completeness = 'complete') then
    raise exception 'Order was costed before any cost existed';
  end if;

  -- Owner enters "Karak costs about AED 1.25 to make", counting from 30 days ago.
  perform public.set_finance_quick_item_cost(r, karak, 125, (now() at time zone 'Asia/Dubai')::date - 30, owner_id);
  result := public.recost_finance_incomplete_orders(r, (now() at time zone 'Asia/Dubai')::date - 30,
    (now() at time zone 'Asia/Dubai')::date, 1000);
  if (result->>'orders_processed')::integer <> 2 then raise exception 'Recost did not pick up both orders: %', result; end if;
  if not exists (select 1 from public.finance_product_cost_snapshots where order_id = '8a000000-0000-0000-0000-000000000001'
                 and completeness = 'complete' and unit_direct_cost_fils = 125 and total_direct_cost_fils = 250) then
    raise exception 'Quick cost not applied to the past order';
  end if;
  -- The add-on is included in the item's cost, so the order is complete too.
  if not exists (select 1 from public.finance_product_cost_snapshots where order_id = '8a000000-0000-0000-0000-000000000002'
                 and completeness = 'complete' and unit_direct_cost_fils = 125) then
    raise exception 'Order with an add-on was not costed';
  end if;
  -- Complete orders are left alone on the next recost.
  result := public.recost_finance_incomplete_orders(r, (now() at time zone 'Asia/Dubai')::date - 30,
    (now() at time zone 'Asia/Dubai')::date, 1000);
  if (result->>'orders_processed')::integer <> 0 then raise exception 'Recost touched complete orders: %', result; end if;

  -- Changing the cost adds a new price; the screen shows the latest one.
  perform public.set_finance_quick_item_cost(r, karak, 150, (now() at time zone 'Asia/Dubai')::date - 30, owner_id);
  if (select quick_cost_fils from public.get_finance_quick_item_costs(r) where menu_item_id = karak) <> 150
     or (select count(*) from public.finance_recipes where restaurant_id = r and menu_item_id = karak and menu_option_id is null) <> 1 then
    raise exception 'Changing a quick cost duplicated the recipe or kept the old cost';
  end if;

  -- A full recipe is never overwritten.
  begin
    perform public.set_finance_quick_item_cost(r, '4a000000-0000-0000-0000-000000000002', 100, (now() at time zone 'Asia/Dubai')::date, owner_id);
    raise exception 'Quick cost replaced a full recipe';
  exception when others then
    if sqlerrm not like '%uses a full recipe%' then raise; end if;
  end;
  if not (select has_full_recipe from public.get_finance_quick_item_costs(r) where menu_item_id = '4a000000-0000-0000-0000-000000000002') then
    raise exception 'Full recipe not reported';
  end if;
  begin
    perform public.set_finance_quick_item_cost(r, karak, 0, (now() at time zone 'Asia/Dubai')::date, owner_id);
    raise exception 'Zero cost accepted';
  exception when others then
    if sqlerrm not like '%greater than zero%' then raise; end if;
  end;

  if has_function_privilege('authenticated', 'public.set_finance_quick_item_cost(uuid,uuid,bigint,date,uuid)', 'execute')
     or has_function_privilege('anon', 'public.recost_finance_incomplete_orders(uuid,date,date,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.get_finance_quick_item_costs(uuid)', 'execute') then
    raise exception 'Quick-cost functions exposed to browser roles';
  end if;
end;
$quick$;

rollback;
