\set ON_ERROR_STOP on
-- Stamps for counter (staff) orders (20261202090000). Rollback-only.
begin;

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active, accepting_orders,
  loyalty_enabled, loyalty_stamps_required, loyalty_qualifying_min_amount)
values ('29900000-0000-0000-0000-000000000001', 'Stamp cafe', 'stamp-cafe', '971500000501', 'live', true, true, true, 7, 5),
       ('29900000-0000-0000-0000-000000000002', 'Other stamp cafe', 'stamp-cafe-other', '971500000502', 'live', true, true, true, 7, null),
       ('29900000-0000-0000-0000-000000000003', 'No loyalty cafe', 'stamp-cafe-off', '971500000503', 'live', true, true, false, 7, null);

-- An existing customer with marketing consent and a real name.
insert into public.customers (id, restaurant_id, name, phone, delivery_area, delivery_address,
  consent_order_processing, consent_marketing, marketing_opt_in, loyalty_points_balance, lifetime_points_earned)
values ('39900000-0000-0000-0000-000000000001', '29900000-0000-0000-0000-000000000001', 'Sara', '971500000601', '', '',
  true, true, true, 2, 2);

create function pg_temp.punch(id uuid, restaurant uuid, phone text, name text, status text, total numeric,
  source text default 'staff')
returns void language sql as $$
  insert into public.orders (id, restaurant_id, customer_name, customer_phone, fulfilment_type, payment_method,
    items, subtotal, delivery_fee, total, status, whatsapp_message, consent_order_processing, consent_timestamp, source)
  values (id, restaurant, name, phone, 'takeaway', case when status = 'Completed' then 'Cash on Delivery'::public.payment_method end,
    jsonb_build_array(jsonb_build_object('item_id', 'tea', 'name', 'Tea', 'price', total, 'quantity', 1)),
    total, 0, total, status::public.order_status, 'x', true, now(), source)
$$;

do $$ declare
  cafe uuid := '29900000-0000-0000-0000-000000000001';
  c public.customers%rowtype;
begin
  -- 1. Walk-in paid at the till: customer row created, stamp awarded.
  perform pg_temp.punch('49900000-0000-0000-0000-000000000001', cafe, '971500000602', 'Omar', 'Completed', 12);
  select * into c from public.customers where restaurant_id = cafe and phone = '971500000602';
  if not found then raise exception 'customer row not created'; end if;
  if c.name <> 'Omar' or not c.consent_order_processing or c.consent_marketing or c.marketing_opt_in then
    raise exception 'new customer row wrong: %', to_jsonb(c); end if;
  if c.loyalty_points_balance <> 1 or c.lifetime_points_earned <> 1 or c.total_orders <> 1 or c.total_spend <> 12 then
    raise exception 'stamp/totals wrong: %', to_jsonb(c); end if;
  if (select count(*) from public.loyalty_transactions where order_id = '49900000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'earned row missing'; end if;

  -- 2. Existing customer: stamp added, name and marketing consent untouched.
  perform pg_temp.punch('49900000-0000-0000-0000-000000000002', cafe, '971500000601', 'Walk-in customer', 'Completed', 10);
  select * into c from public.customers where id = '39900000-0000-0000-0000-000000000001';
  if c.name <> 'Sara' or not c.consent_marketing or not c.marketing_opt_in or c.loyalty_points_balance <> 3 then
    raise exception 'existing customer changed wrongly: %', to_jsonb(c); end if;

  -- 3. Below the café's minimum amount: customer ensured, no stamp.
  perform pg_temp.punch('49900000-0000-0000-0000-000000000003', cafe, '971500000603', 'Walk-in customer', 'Completed', 4);
  select * into c from public.customers where restaurant_id = cafe and phone = '971500000603';
  if not found or c.name <> 'Walk-in customer' or c.loyalty_points_balance <> 0 then
    raise exception 'below-minimum handling wrong: %', to_jsonb(c); end if;

  -- 4. Sent to the kitchen: customer ensured now, stamp later on completion
  --    through the existing transition function (exactly one).
  perform pg_temp.punch('49900000-0000-0000-0000-000000000004', cafe, '971500000604', 'Lina', 'Preparing', 20);
  select * into c from public.customers where restaurant_id = cafe and phone = '971500000604';
  if not found or c.loyalty_points_balance <> 0 then raise exception 'kitchen order handled wrongly'; end if;
  perform public.transition_order_status_and_award_loyalty(cafe, '49900000-0000-0000-0000-000000000004', 'Completed');
  select * into c from public.customers where restaurant_id = cafe and phone = '971500000604';
  if c.loyalty_points_balance <> 1 then raise exception 'kitchen order not stamped on completion: %', to_jsonb(c); end if;

  -- 5. No phone, blank phone, or non-staff source: nothing happens.
  perform pg_temp.punch('49900000-0000-0000-0000-000000000005', cafe, '', 'Walk-in customer', 'Completed', 12);
  perform pg_temp.punch('49900000-0000-0000-0000-000000000006', cafe, '   ', 'Walk-in customer', 'Completed', 12);
  if exists (select 1 from public.customers where restaurant_id = cafe and btrim(phone) = '') then
    raise exception 'blank phone created a customer'; end if;
  perform pg_temp.punch('49900000-0000-0000-0000-000000000007', cafe, '971500000605', 'Web', 'Completed', 12, 'customer');
  if exists (select 1 from public.customers where restaurant_id = cafe and phone = '971500000605') then
    raise exception 'non-staff order handled by staff trigger'; end if;

  -- 6. Same phone at another café: its own customer and stamp.
  perform pg_temp.punch('49900000-0000-0000-0000-000000000008', '29900000-0000-0000-0000-000000000002', '971500000602', 'Omar', 'Completed', 3);
  if (select loyalty_points_balance from public.customers
      where restaurant_id = '29900000-0000-0000-0000-000000000002' and phone = '971500000602') <> 1 then
    raise exception 'other cafe stamp wrong'; end if;
  if (select loyalty_points_balance from public.customers where restaurant_id = cafe and phone = '971500000602') <> 1 then
    raise exception 'other cafe order touched this cafe'; end if;

  -- 7. Loyalty switched off: customer ensured, no stamp.
  perform pg_temp.punch('49900000-0000-0000-0000-000000000009', '29900000-0000-0000-0000-000000000003', '971500000606', 'Ali', 'Completed', 12);
  if (select loyalty_points_balance from public.customers
      where restaurant_id = '29900000-0000-0000-0000-000000000003' and phone = '971500000606') <> 0 then
    raise exception 'stamp given with loyalty off'; end if;
end $$;

do $$ begin
  if has_function_privilege('authenticated', 'public.staff_order_customer_and_stamp()', 'execute')
     or has_function_privilege('anon', 'public.staff_order_customer_and_stamp()', 'execute') then
    raise exception 'trigger function callable by browser roles';
  end if;
end $$;

rollback;
