\set ON_ERROR_STOP on
-- Counter reward redemption (20261203090000). Rollback-only.
begin;

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active, accepting_orders,
  loyalty_enabled, loyalty_stamps_required, loyalty_reward_description)
values ('29a00000-0000-0000-0000-000000000001', 'Reward cafe', 'reward-cafe', '971500000701', 'live', true, true, true, 3, 'Crunch Burger'),
       ('29a00000-0000-0000-0000-000000000002', 'Other reward cafe', 'reward-cafe-other', '971500000702', 'live', true, true, true, 3, 'Tea');

insert into public.customers (id, restaurant_id, name, phone, delivery_area, delivery_address, loyalty_points_balance, lifetime_points_earned)
values ('39a00000-0000-0000-0000-000000000001', '29a00000-0000-0000-0000-000000000001', 'Sara', '971500000801', '', '', 3, 3),
       ('39a00000-0000-0000-0000-000000000002', '29a00000-0000-0000-0000-000000000001', 'Omar', '971500000802', '', '', 1, 1);

create function pg_temp.punch(id uuid, phone text, status text, notes text default null,
  restaurant uuid default '29a00000-0000-0000-0000-000000000001')
returns void language sql as $$
  insert into public.orders (id, restaurant_id, customer_name, customer_phone, fulfilment_type, payment_method,
    items, subtotal, delivery_fee, total, status, whatsapp_message, consent_order_processing, consent_timestamp, source, notes)
  values (id, restaurant, 'Walk-in customer', phone, 'takeaway',
    case when status = 'Completed' then 'Cash on Delivery'::public.payment_method end,
    jsonb_build_array(jsonb_build_object('item_id', 'tea', 'name', 'Tea', 'price', 10, 'quantity', 1)),
    10, 0, 10, status::public.order_status, 'x', true, now(), 'staff', notes)
$$;

do $$ declare
  cafe uuid := '29a00000-0000-0000-0000-000000000001';
  result jsonb;
  o public.orders%rowtype;
begin
  -- Paid at the till with 3 stamps: the order earns 1 (-> 4), redeeming takes 3 (-> 1).
  perform pg_temp.punch('49a00000-0000-0000-0000-000000000001', '971500000801', 'Completed', 'No sugar');
  result := public.redeem_loyalty_reward_for_order(cafe, '49a00000-0000-0000-0000-000000000001');
  if not (result->>'ok')::boolean or (result->>'already')::boolean or (result->>'stamps_remaining')::int <> 1 then
    raise exception 'redeem failed: %', result; end if;
  if (select loyalty_points_balance from public.customers where id = '39a00000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'balance not deducted'; end if;
  select * into o from public.orders where id = '49a00000-0000-0000-0000-000000000001';
  if o.points_redeemed <> 3 or o.notes <> E'No sugar\nLoyalty reward: free Crunch Burger' or o.total <> 10 then
    raise exception 'order not marked correctly: %', to_jsonb(o); end if;
  if (select count(*) from public.loyalty_transactions where order_id = o.id and type = 'redeemed' and points = -3) <> 1 then
    raise exception 'redeemed row missing'; end if;

  -- Replaying the same order never deducts twice.
  result := public.redeem_loyalty_reward_for_order(cafe, '49a00000-0000-0000-0000-000000000001');
  if not (result->>'already')::boolean then raise exception 'replay not idempotent: %', result; end if;
  if (select loyalty_points_balance from public.customers where id = '39a00000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'replay deducted again'; end if;
  if (select notes from public.orders where id = '49a00000-0000-0000-0000-000000000001') <> E'No sugar\nLoyalty reward: free Crunch Burger' then
    raise exception 'replay changed the notes'; end if;

  -- Not enough stamps (1 + 1 earned = 2 < 3): refused, nothing changes.
  perform pg_temp.punch('49a00000-0000-0000-0000-000000000002', '971500000802', 'Completed');
  result := public.redeem_loyalty_reward_for_order(cafe, '49a00000-0000-0000-0000-000000000002');
  if result->>'reason' <> 'not_enough_stamps' or (result->>'stamps')::int <> 2 then
    raise exception 'short balance not refused: %', result; end if;
  if (select notes from public.orders where id = '49a00000-0000-0000-0000-000000000002') is not null then
    raise exception 'refused redemption touched the order'; end if;

  -- Kitchen order (not yet completed) can carry the reward too.
  update public.customers set loyalty_points_balance = 3 where id = '39a00000-0000-0000-0000-000000000002';
  perform pg_temp.punch('49a00000-0000-0000-0000-000000000003', '971500000802', 'Preparing');
  result := public.redeem_loyalty_reward_for_order(cafe, '49a00000-0000-0000-0000-000000000003');
  if not (result->>'ok')::boolean then raise exception 'kitchen redemption failed: %', result; end if;
  if (select loyalty_points_balance from public.customers where id = '39a00000-0000-0000-0000-000000000002') <> 0 then
    raise exception 'kitchen redemption balance wrong'; end if;

  -- No phone, unknown order, another restaurant's order, cancelled order.
  perform pg_temp.punch('49a00000-0000-0000-0000-000000000004', '', 'Completed');
  if public.redeem_loyalty_reward_for_order(cafe, '49a00000-0000-0000-0000-000000000004')->>'reason' <> 'no_phone' then
    raise exception 'no-phone order redeemed'; end if;
  if public.redeem_loyalty_reward_for_order(cafe, '49a00000-0000-0000-0000-0000000000ff')->>'reason' <> 'order_not_found' then
    raise exception 'unknown order accepted'; end if;
  perform pg_temp.punch('49a00000-0000-0000-0000-000000000005', '971500000801', 'Completed', null, '29a00000-0000-0000-0000-000000000002');
  if public.redeem_loyalty_reward_for_order(cafe, '49a00000-0000-0000-0000-000000000005')->>'reason' <> 'order_not_found' then
    raise exception 'cross-restaurant order accepted'; end if;
  update public.customers set loyalty_points_balance = 5 where id = '39a00000-0000-0000-0000-000000000001';
  perform pg_temp.punch('49a00000-0000-0000-0000-000000000006', '971500000801', 'Preparing');
  update public.orders set status = 'Cancelled' where id = '49a00000-0000-0000-0000-000000000006';
  if public.redeem_loyalty_reward_for_order(cafe, '49a00000-0000-0000-0000-000000000006')->>'reason' <> 'order_cancelled' then
    raise exception 'cancelled order redeemed'; end if;
end $$;

do $$ begin
  if has_function_privilege('authenticated', 'public.redeem_loyalty_reward_for_order(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public.redeem_loyalty_reward_for_order(uuid,uuid)', 'execute') then
    raise exception 'redemption callable by browser roles';
  end if;
end $$;

rollback;
