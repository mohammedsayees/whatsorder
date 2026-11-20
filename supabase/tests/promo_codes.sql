\set ON_ERROR_STOP on
-- Promo code checkout (create_order_with_customer_v6). Rollback-only.
begin;

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active, accepting_orders)
values ('29500000-0000-0000-0000-000000000001', 'Promo cafe', 'promo-cafe', '971500000291', 'live', true, true),
       ('29500000-0000-0000-0000-000000000002', 'Other promo cafe', 'promo-cafe-other', '971500000292', 'live', true, true);

insert into public.promo_codes (id, restaurant_id, code, discount_type, discount_value, max_discount, min_subtotal,
  max_redemptions, max_redemptions_per_customer, first_order_only)
values
  ('39500000-0000-0000-0000-000000000001', '29500000-0000-0000-0000-000000000001', 'SAVE10', 'percent', 10, 3, 20, 2, 1, false),
  ('39500000-0000-0000-0000-000000000002', '29500000-0000-0000-0000-000000000001', 'WELCOME', 'fixed', 5, null, 0, null, null, true),
  ('39500000-0000-0000-0000-000000000003', '29500000-0000-0000-0000-000000000002', 'OTHER', 'fixed', 5, null, 0, null, null, false);

-- Test helper: a takeaway order of `subtotal` with an optional code.
create function pg_temp.place(phone text, subtotal numeric, code text, discount numeric, token text,
  restaurant uuid default '29500000-0000-0000-0000-000000000001')
returns jsonb language sql as $$
  select public.create_order_with_customer_v6(
    restaurant, 'Promo customer', phone, 'takeaway', null, null, null, null, null, null, null,
    null, null, null, null, null, 'Cash on Delivery',
    jsonb_build_array(jsonb_build_object('item_id', 'tea', 'name', 'Tea', 'price', subtotal, 'quantity', 1)),
    subtotal, 0, subtotal - coalesce(discount, 0), 'msg', true, false, now(), token, code, discount)
$$;

create function pg_temp.fails_with(statement text, expected text) returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when others then
  if sqlerrm not like '%' || expected || '%' then
    raise exception 'expected "%", got "%"', expected, sqlerrm;
  end if;
  return true;
end $$;

do $$ declare
  result jsonb;
  welcome_order uuid;
  saved public.orders%rowtype;
begin
  -- No code: identical to v5.
  result := pg_temp.place('971500000001', 50, null, null, 'promo-plain');
  select * into saved from public.orders where id = (result->>'order_id')::uuid;
  if saved.discount_amount <> 0 or saved.total <> 50 then raise exception 'plain order changed: %', to_jsonb(saved); end if;

  -- 10% of 50 = 5, capped at 3; total reconciles; redemption recorded.
  result := pg_temp.place('971500000002', 50, ' save10 ', 3, 'promo-1');
  select * into saved from public.orders where id = (result->>'order_id')::uuid;
  if saved.discount_amount <> 3 or saved.total <> 47 or saved.promo_code <> 'SAVE10'
     or saved.discount_reason <> 'Promo code SAVE10' then
    raise exception 'promo order wrong: %', to_jsonb(saved); end if;
  if (select count(*) from public.promo_code_redemptions where order_id = saved.id) <> 1 then
    raise exception 'redemption missing'; end if;

  -- Retrying the same submission returns the same order, no second redemption.
  result := pg_temp.place('971500000002', 50, 'SAVE10', 3, 'promo-1');
  if (result->>'order_id')::uuid <> saved.id
     or (select count(*) from public.promo_code_redemptions) <> 1 then
    raise exception 'replay was not idempotent'; end if;

  -- Per-customer limit (1), minimum subtotal (20), stale amount, wrong total.
  perform pg_temp.fails_with($q$select pg_temp.place('971500000002', 50, 'SAVE10', 3, 'promo-2')$q$, 'already used');
  perform pg_temp.fails_with($q$select pg_temp.place('971500000003', 10, 'SAVE10', 1, 'promo-3')$q$, 'higher order amount');
  perform pg_temp.fails_with($q$select pg_temp.place('971500000003', 50, 'SAVE10', 5, 'promo-4')$q$, 'discount has changed');
  perform pg_temp.fails_with($q$select public.create_order_with_customer_v6('29500000-0000-0000-0000-000000000001','x','971500000003','takeaway',null,null,null,null,null,null,null,null,null,null,null,null,'Cash on Delivery','[]'::jsonb,50,0,50,'m',true,false,now(),'promo-5','SAVE10',3)$q$, 'total does not match');
  -- A discount amount without a code is refused.
  perform pg_temp.fails_with($q$select pg_temp.place('971500000003', 50, null, 3, 'promo-6')$q$, 'total does not match');

  -- Total limit (2): second customer uses it, third is refused...
  perform pg_temp.place('971500000004', 50, 'SAVE10', 3, 'promo-7');
  perform pg_temp.fails_with($q$select pg_temp.place('971500000005', 50, 'SAVE10', 3, 'promo-8')$q$, 'fully used');
  -- ...until a redeemed order is cancelled, which frees its use.
  update public.orders set status = 'Cancelled' where id = saved.id;
  perform pg_temp.place('971500000005', 50, 'SAVE10', 3, 'promo-9');

  -- First-order-only: refused for a customer with an order, fine for a new one.
  perform pg_temp.fails_with($q$select pg_temp.place('971500000001', 30, 'WELCOME', 5, 'promo-10')$q$, 'first orders only');
  result := pg_temp.place('971500000006', 30, 'WELCOME', 5, 'promo-11');
  welcome_order := (result->>'order_id')::uuid;
  if (select total from public.orders where id = welcome_order) <> 25 then
    raise exception 'fixed promo wrong'; end if;

  -- Usage preview: SAVE10 has 2 live uses (one cancelled use is ignored).
  result := public.get_promo_code_usage('29500000-0000-0000-0000-000000000001',
    '39500000-0000-0000-0000-000000000001', '971500000004');
  if (result->>'total_used')::int <> 2 or (result->>'customer_used')::int <> 1
     or (result->>'customer_has_orders')::boolean is not true then
    raise exception 'usage preview wrong: %', result; end if;
  result := public.get_promo_code_usage('29500000-0000-0000-0000-000000000001',
    '39500000-0000-0000-0000-000000000001', null);
  if (result->>'customer_used')::int <> 0 or (result->>'customer_has_orders')::boolean then
    raise exception 'usage preview without phone wrong: %', result; end if;

  -- Inactive, expired, unknown and another tenant's codes are refused.
  update public.promo_codes set is_active = false where code = 'WELCOME';
  perform pg_temp.fails_with($q$select pg_temp.place('971500000007', 30, 'WELCOME', 5, 'promo-12')$q$, 'not valid');
  update public.promo_codes set is_active = true, ends_at = now() - interval '1 minute',
    starts_at = now() - interval '1 day' where code = 'WELCOME';
  perform pg_temp.fails_with($q$select pg_temp.place('971500000007', 30, 'WELCOME', 5, 'promo-13')$q$, 'expired');
  perform pg_temp.fails_with($q$select pg_temp.place('971500000007', 30, 'NOPE', 5, 'promo-14')$q$, 'not valid');
  perform pg_temp.fails_with($q$select pg_temp.place('971500000007', 30, 'OTHER', 5, 'promo-15')$q$, 'not valid');

  -- A rejected promo rolls back the whole order.
  if exists (select 1 from public.order_submission_keys where submission_token = 'promo-15') then
    raise exception 'refused promo left an order behind'; end if;

  -- Staff cannot overwrite a promo discount (e.g. an unpaid online order).
  update public.orders set payment_method = null where id = welcome_order;
  perform pg_temp.fails_with(format($q$select public.apply_order_discount(%L, %L, 'percent', 5, 'x', null, 'owner')$q$,
    '29500000-0000-0000-0000-000000000001', welcome_order), 'promo code cannot be discounted');

  -- Codes are unique per restaurant and must match the format.
  perform pg_temp.fails_with($q$insert into public.promo_codes(restaurant_id, code, discount_type, discount_value) values ('29500000-0000-0000-0000-000000000001', 'SAVE10', 'fixed', 1)$q$, 'duplicate');
  perform pg_temp.fails_with($q$insert into public.promo_codes(restaurant_id, code, discount_type, discount_value) values ('29500000-0000-0000-0000-000000000001', 'bad code', 'fixed', 1)$q$, 'check');

  -- The queue exposes the promo code.
  if not exists (
    select 1 from jsonb_array_elements((public.get_admin_orders_page_v4(
      '29500000-0000-0000-0000-000000000001', 'active', 'all', 1, 25, 'oldest', null, 'all'))->'items') item
    where item->>'promo_code' = 'WELCOME'
  ) then raise exception 'queue missing promo_code'; end if;
end $$;

do $$ begin
  if has_function_privilege('anon', 'public.create_order_with_customer_v6(uuid,text,text,text,text,text,text,text,text,numeric,numeric,text,text,text,text,text,text,jsonb,numeric,numeric,numeric,text,boolean,boolean,timestamptz,text,text,numeric)', 'execute')
    or has_function_privilege('authenticated', 'public.create_order_with_customer_v6(uuid,text,text,text,text,text,text,text,text,numeric,numeric,text,text,text,text,text,text,jsonb,numeric,numeric,numeric,text,boolean,boolean,timestamptz,text,text,numeric)', 'execute') then
    raise exception 'create_order_with_customer_v6 must stay service-role only';
  end if;
  if has_function_privilege('authenticated', 'public.get_promo_code_usage(uuid,uuid,text)', 'execute') then
    raise exception 'get_promo_code_usage must stay service-role only';
  end if;
  if has_table_privilege('authenticated', 'public.promo_codes', 'insert')
    or has_table_privilege('anon', 'public.promo_codes', 'select') then
    raise exception 'promo_codes must be read-only for members and hidden from anon';
  end if;
end $$;
rollback;
