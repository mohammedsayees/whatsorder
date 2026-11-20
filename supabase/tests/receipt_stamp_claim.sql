\set ON_ERROR_STOP on
-- Receipt stamp claim (20261204090000). Rollback-only.
begin;

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active, accepting_orders,
  loyalty_enabled, loyalty_stamps_required, loyalty_reward_description, loyalty_qualifying_min_amount)
values ('29b00000-0000-0000-0000-000000000001', 'Claim cafe', 'claim-cafe', '971500000901', 'live', true, true, true, 7, 'Crunch Burger', 5),
       ('29b00000-0000-0000-0000-000000000002', 'Off cafe', 'claim-cafe-off', '971500000902', 'live', true, true, false, 7, 'Tea', null);

insert into public.customers (id, restaurant_id, name, phone, delivery_area, delivery_address,
  consent_order_processing, consent_marketing, marketing_opt_in, loyalty_points_balance, lifetime_points_earned)
values ('39b00000-0000-0000-0000-000000000001', '29b00000-0000-0000-0000-000000000001', 'Sara', '971500001001', '', '',
  true, true, true, 2, 2);

create function pg_temp.punch(id uuid, status text, total numeric default 10, source text default 'staff',
  phone text default '', restaurant uuid default '29b00000-0000-0000-0000-000000000001',
  created timestamptz default now())
returns void language sql as $$
  insert into public.orders (id, restaurant_id, customer_name, customer_phone, fulfilment_type, payment_method,
    items, subtotal, delivery_fee, total, status, whatsapp_message, consent_order_processing, consent_timestamp,
    source, created_at)
  values (id, restaurant, 'Walk-in customer', phone, 'takeaway',
    case when status = 'Completed' then 'Cash on Delivery'::public.payment_method end,
    jsonb_build_array(jsonb_build_object('item_id', 'tea', 'name', 'Tea', 'price', total, 'quantity', 1)),
    total, 0, total, status::public.order_status, 'x', true, now(), source, created)
$$;

do $$ declare
  cafe uuid := '29b00000-0000-0000-0000-000000000001';
  result jsonb;
  c public.customers%rowtype;
begin
  -- 1. Existing customer claims a paid counter order: phone set, stamp given,
  --    name and marketing consent untouched.
  perform pg_temp.punch('49b00000-0000-0000-0000-000000000001', 'Completed');
  result := public.claim_order_stamp(cafe, '49b00000-0000-0000-0000-000000000001', '971500001001');
  if not (result->>'ok')::boolean or not (result->>'stamped')::boolean or (result->>'stamps')::int <> 3 then
    raise exception 'claim failed: %', result; end if;
  select * into c from public.customers where id = '39b00000-0000-0000-0000-000000000001';
  if c.loyalty_points_balance <> 3 or c.name <> 'Sara' or not c.consent_marketing then
    raise exception 'customer wrong: %', to_jsonb(c); end if;
  if (select customer_phone from public.orders where id = '49b00000-0000-0000-0000-000000000001') <> '971500001001' then
    raise exception 'phone not attached'; end if;

  -- 2. Same phone again: same answer, no second stamp.
  result := public.claim_order_stamp(cafe, '49b00000-0000-0000-0000-000000000001', '971500001001');
  if not (result->>'already')::boolean or (select loyalty_points_balance from public.customers where id = c.id) <> 3 then
    raise exception 'reclaim not idempotent: %', result; end if;

  -- 3. Someone else cannot take an order already claimed.
  if public.claim_order_stamp(cafe, '49b00000-0000-0000-0000-000000000001', '971500001002')->>'reason' <> 'already_claimed' then
    raise exception 'second phone took the order'; end if;

  -- 4. New customer: row created with order-processing consent only.
  perform pg_temp.punch('49b00000-0000-0000-0000-000000000002', 'Completed');
  result := public.claim_order_stamp(cafe, '49b00000-0000-0000-0000-000000000002', '971500001003');
  select * into c from public.customers where restaurant_id = cafe and phone = '971500001003';
  if not found or c.loyalty_points_balance <> 1 or c.consent_marketing or not c.consent_order_processing then
    raise exception 'new customer wrong: % %', result, to_jsonb(c); end if;

  -- 5. Kitchen order: phone attached now, stamp when completed (once).
  perform pg_temp.punch('49b00000-0000-0000-0000-000000000003', 'Preparing');
  result := public.claim_order_stamp(cafe, '49b00000-0000-0000-0000-000000000003', '971500001003');
  if (result->>'stamped')::boolean or not (result->>'pending')::boolean then
    raise exception 'kitchen claim wrong: %', result; end if;
  perform public.transition_order_status_and_award_loyalty(cafe, '49b00000-0000-0000-0000-000000000003', 'Completed');
  if (select loyalty_points_balance from public.customers where restaurant_id = cafe and phone = '971500001003') <> 2 then
    raise exception 'kitchen order not stamped on completion'; end if;

  -- 6. Below the minimum: phone attached, no stamp.
  perform pg_temp.punch('49b00000-0000-0000-0000-000000000004', 'Completed', 3);
  result := public.claim_order_stamp(cafe, '49b00000-0000-0000-0000-000000000004', '971500001004');
  if (result->>'stamped')::boolean or (result->>'stamps')::int <> 0 then
    raise exception 'below-minimum claim stamped: %', result; end if;

  -- 7. Refusals: bad phone, cancelled, older than 24h, not a staff order,
  --    unknown / other-restaurant order, loyalty off, phone already on order.
  perform pg_temp.punch('49b00000-0000-0000-0000-000000000005', 'Completed');
  if public.claim_order_stamp(cafe, '49b00000-0000-0000-0000-000000000005', '12ab')->>'reason' <> 'invalid_phone' then
    raise exception 'bad phone accepted'; end if;
  perform pg_temp.punch('49b00000-0000-0000-0000-000000000006', 'Preparing');
  update public.orders set status = 'Cancelled' where id = '49b00000-0000-0000-0000-000000000006';
  if public.claim_order_stamp(cafe, '49b00000-0000-0000-0000-000000000006', '971500001005')->>'reason' <> 'order_cancelled' then
    raise exception 'cancelled order claimed'; end if;
  perform pg_temp.punch('49b00000-0000-0000-0000-000000000007', 'Completed', 10, 'staff', '', cafe, now() - interval '25 hours');
  if public.claim_order_stamp(cafe, '49b00000-0000-0000-0000-000000000007', '971500001005')->>'reason' <> 'expired' then
    raise exception 'old order claimed'; end if;
  perform pg_temp.punch('49b00000-0000-0000-0000-000000000008', 'Completed', 10, 'customer');
  if public.claim_order_stamp(cafe, '49b00000-0000-0000-0000-000000000008', '971500001005')->>'reason' <> 'order_not_found' then
    raise exception 'non-staff order claimed'; end if;
  if public.claim_order_stamp('29b00000-0000-0000-0000-000000000002', '49b00000-0000-0000-0000-000000000005', '971500001005')->>'reason' <> 'order_not_found' then
    raise exception 'order claimed through another restaurant'; end if;
  perform pg_temp.punch('49b00000-0000-0000-0000-000000000009', 'Completed', 10, 'staff', '', '29b00000-0000-0000-0000-000000000002');
  if public.claim_order_stamp('29b00000-0000-0000-0000-000000000002', '49b00000-0000-0000-0000-000000000009', '971500001005')->>'reason' <> 'loyalty_off' then
    raise exception 'claimed with loyalty off'; end if;
  perform pg_temp.punch('49b00000-0000-0000-0000-00000000000a', 'Completed', 10, 'staff', '971500001006');
  if public.claim_order_stamp(cafe, '49b00000-0000-0000-0000-00000000000a', '971500001005')->>'reason' <> 'already_claimed' then
    raise exception 'order with a phone was claimed'; end if;
end $$;

do $$ begin
  if has_function_privilege('authenticated', 'public.claim_order_stamp(uuid,uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.claim_order_stamp(uuid,uuid,text)', 'execute') then
    raise exception 'claim callable by browser roles';
  end if;
end $$;

rollback;
