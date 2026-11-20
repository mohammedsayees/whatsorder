\set ON_ERROR_STOP on
-- Customer vouchers (20261130090000). Rollback-only.
begin;

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active, accepting_orders)
values ('29700000-0000-0000-0000-000000000001', 'Voucher cafe', 'voucher-cafe', '971500000298', 'live', true, true),
       ('29700000-0000-0000-0000-000000000002', 'Other voucher cafe', 'voucher-cafe-other', '971500000299', 'live', true, true);

insert into public.promo_codes (id, restaurant_id, code, description, discount_type, discount_value, min_subtotal,
  max_redemptions, max_redemptions_per_customer, first_order_only, show_in_account, is_active, starts_at, ends_at)
values
  -- Shown, usable.
  ('39700000-0000-0000-0000-000000000001', '29700000-0000-0000-0000-000000000001', 'SHOWN', 'secret note', 'percent', 10, 0, null, 2, false, true, true, null, null),
  -- Not opted in.
  ('39700000-0000-0000-0000-000000000002', '29700000-0000-0000-0000-000000000001', 'HIDDEN', null, 'fixed', 5, 0, null, null, false, false, true, null, null),
  -- Opted in but off / not started / expired.
  ('39700000-0000-0000-0000-000000000003', '29700000-0000-0000-0000-000000000001', 'OFFCODE', null, 'fixed', 5, 0, null, null, false, true, false, null, null),
  ('39700000-0000-0000-0000-000000000004', '29700000-0000-0000-0000-000000000001', 'LATER', null, 'fixed', 5, 0, null, null, false, true, true, now() + interval '1 day', null),
  ('39700000-0000-0000-0000-000000000005', '29700000-0000-0000-0000-000000000001', 'EXPIRED', null, 'fixed', 5, 0, null, null, false, true, true, null, now() - interval '1 minute'),
  -- First order only.
  ('39700000-0000-0000-0000-000000000006', '29700000-0000-0000-0000-000000000001', 'WELCOME', null, 'fixed', 5, 0, null, null, true, true, true, null, null),
  -- Total limit 1.
  ('39700000-0000-0000-0000-000000000007', '29700000-0000-0000-0000-000000000001', 'ONEONLY', null, 'fixed', 5, 0, 1, null, false, true, true, null, null),
  -- Another café.
  ('39700000-0000-0000-0000-000000000008', '29700000-0000-0000-0000-000000000002', 'OTHERCAFE', null, 'fixed', 5, 0, null, null, false, true, true, null, null);

create function pg_temp.place(phone text, code text, discount numeric, token text)
returns uuid language sql as $$
  select (public.create_order_with_customer_v6(
    '29700000-0000-0000-0000-000000000001', 'Voucher customer', phone, 'takeaway', null, null, null, null, null, null, null,
    null, null, null, null, null, 'Cash on Delivery',
    jsonb_build_array(jsonb_build_object('item_id', 'tea', 'name', 'Tea', 'price', 50, 'quantity', 1)),
    50, 0, 50 - coalesce(discount, 0), 'msg', true, false, now(), token, code, discount)->>'order_id')::uuid
$$;

create function pg_temp.codes(phone text, restaurant uuid default '29700000-0000-0000-0000-000000000001')
returns text[] language sql as $$
  select coalesce(array_agg(v->>'code' order by v->>'code'), '{}')
  from jsonb_array_elements(public.get_customer_vouchers(restaurant, phone)) v
$$;

do $$ declare
  shown jsonb;
  first_order uuid;
begin
  -- New customer: opted-in, live codes only (incl. first-order and limited).
  if pg_temp.codes('971500000201') <> array['ONEONLY', 'SHOWN', 'WELCOME'] then
    raise exception 'new customer vouchers wrong: %', pg_temp.codes('971500000201'); end if;

  -- Never exposes the owner's note or internal ids.
  shown := (select v from jsonb_array_elements(public.get_customer_vouchers('29700000-0000-0000-0000-000000000001', '971500000201')) v where v->>'code' = 'SHOWN');
  if shown ? 'description' or shown ? 'id' or shown ? 'restaurant_id' then
    raise exception 'voucher leaks private fields: %', shown; end if;
  if (shown->>'uses_left')::int <> 2 then raise exception 'uses_left wrong: %', shown; end if;

  -- Other café only sees its own codes.
  if pg_temp.codes('971500000201', '29700000-0000-0000-0000-000000000002') <> array['OTHERCAFE'] then
    raise exception 'cross-cafe vouchers wrong'; end if;

  -- After an order: first-order code disappears; per-customer use counts.
  first_order := pg_temp.place('971500000201', 'SHOWN', 5, 'voucher-1');
  if pg_temp.codes('971500000201') <> array['ONEONLY', 'SHOWN'] then
    raise exception 'after first order wrong: %', pg_temp.codes('971500000201'); end if;
  shown := (select v from jsonb_array_elements(public.get_customer_vouchers('29700000-0000-0000-0000-000000000001', '971500000201')) v where v->>'code' = 'SHOWN');
  if (shown->>'uses_left')::int <> 1 then raise exception 'uses_left not decremented: %', shown; end if;

  -- Per-customer limit reached hides it for that customer only.
  perform pg_temp.place('971500000201', 'SHOWN', 5, 'voucher-2');
  if 'SHOWN' = any(pg_temp.codes('971500000201')) then raise exception 'used-up voucher still shown'; end if;
  if not 'SHOWN' = any(pg_temp.codes('971500000202')) then raise exception 'voucher hidden from another customer'; end if;

  -- Total limit reached hides it for everyone...
  perform pg_temp.place('971500000203', 'ONEONLY', 5, 'voucher-3');
  if 'ONEONLY' = any(pg_temp.codes('971500000202')) then raise exception 'fully used voucher still shown'; end if;
  -- ...until that order is cancelled.
  update public.orders set status = 'Cancelled' where id = (
    select order_id from public.promo_code_redemptions r join public.promo_codes p on p.id = r.promo_code_id where p.code = 'ONEONLY');
  if not 'ONEONLY' = any(pg_temp.codes('971500000202')) then raise exception 'cancelled redemption still counted'; end if;

  -- No phone, no vouchers.
  if pg_temp.codes('') <> '{}' or pg_temp.codes(null) <> '{}' then raise exception 'blank phone saw vouchers'; end if;
end $$;

do $$ begin
  if has_function_privilege('anon', 'public.get_customer_vouchers(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.get_customer_vouchers(uuid,text)', 'execute') then
    raise exception 'get_customer_vouchers is callable by browser roles';
  end if;
  if (select column_default from information_schema.columns
      where table_name = 'promo_codes' and column_name = 'show_in_account') <> 'false' then
    raise exception 'show_in_account must default to false';
  end if;
end $$;

rollback;
