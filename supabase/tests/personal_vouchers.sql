\set ON_ERROR_STOP on
-- Personal vouchers (20261201090000). Rollback-only.
begin;

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active, accepting_orders)
values ('29800000-0000-0000-0000-000000000001', 'Personal cafe', 'personal-cafe', '971500000301', 'live', true, true),
       ('29800000-0000-0000-0000-000000000002', 'Other personal cafe', 'personal-cafe-other', '971500000302', 'live', true, true);

insert into public.customers (id, restaurant_id, name, phone, delivery_area, delivery_address)
values ('39800000-0000-0000-0000-000000000001', '29800000-0000-0000-0000-000000000001', 'Picked', '971500000401', '', ''),
       ('39800000-0000-0000-0000-000000000002', '29800000-0000-0000-0000-000000000001', 'Not picked', '971500000402', '', ''),
       ('39800000-0000-0000-0000-000000000003', '29800000-0000-0000-0000-000000000002', 'Elsewhere', '971500000401', '', '');

insert into public.promo_codes (id, restaurant_id, code, discount_type, discount_value, min_subtotal,
  max_redemptions_per_customer, audience, show_in_account)
values
  ('49800000-0000-0000-0000-000000000001', '29800000-0000-0000-0000-000000000001', 'JUSTYOU', 'fixed', 5, 0, 1, 'assigned', false),
  ('49800000-0000-0000-0000-000000000002', '29800000-0000-0000-0000-000000000001', 'PUBLIC', 'fixed', 5, 0, null, 'everyone', true),
  ('49800000-0000-0000-0000-000000000003', '29800000-0000-0000-0000-000000000002', 'OTHERCODE', 'fixed', 5, 0, null, 'assigned', false);

insert into public.promo_code_assignments (restaurant_id, promo_code_id, customer_id)
values ('29800000-0000-0000-0000-000000000001', '49800000-0000-0000-0000-000000000001', '39800000-0000-0000-0000-000000000001');

create function pg_temp.place(phone text, code text, token text)
returns uuid language sql as $$
  select (public.create_order_with_customer_v6(
    '29800000-0000-0000-0000-000000000001', 'Personal customer', phone, 'takeaway', null, null, null, null, null, null, null,
    null, null, null, null, null, 'Cash on Delivery',
    jsonb_build_array(jsonb_build_object('item_id', 'tea', 'name', 'Tea', 'price', 50, 'quantity', 1)),
    50, 0, 45, 'msg', true, false, now(), token, code, 5)->>'order_id')::uuid
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

create function pg_temp.codes(phone text, restaurant uuid default '29800000-0000-0000-0000-000000000001')
returns text[] language sql as $$
  select coalesce(array_agg(v->>'code' order by v->>'code'), '{}')
  from jsonb_array_elements(public.get_customer_vouchers(restaurant, phone)) v
$$;

do $$ declare
  orders_before integer;
  usage jsonb;
begin
  -- Constraint: only two audiences.
  if not pg_temp.fails_with($q$update public.promo_codes set audience = 'vip' where code = 'PUBLIC'$q$, 'promo_codes_audience_check') then
    raise exception 'bad audience accepted'; end if;

  -- Tenant FKs: cannot assign another cafe's code or customer.
  if not pg_temp.fails_with($q$insert into public.promo_code_assignments (restaurant_id, promo_code_id, customer_id)
      values ('29800000-0000-0000-0000-000000000001', '49800000-0000-0000-0000-000000000003', '39800000-0000-0000-0000-000000000001')$q$, 'promo_code_assignments_code_tenant_fkey') then
    raise exception 'cross-cafe code assigned'; end if;
  if not pg_temp.fails_with($q$insert into public.promo_code_assignments (restaurant_id, promo_code_id, customer_id)
      values ('29800000-0000-0000-0000-000000000001', '49800000-0000-0000-0000-000000000001', '39800000-0000-0000-0000-000000000003')$q$, 'promo_code_assignments_customer_tenant_fkey') then
    raise exception 'cross-cafe customer assigned'; end if;

  -- Vouchers: recipient sees the personal code (flagged) plus the public one.
  if pg_temp.codes('971500000401') <> array['JUSTYOU', 'PUBLIC'] then
    raise exception 'recipient vouchers wrong: %', pg_temp.codes('971500000401'); end if;
  if not (select (v->>'personal')::boolean from jsonb_array_elements(
      public.get_customer_vouchers('29800000-0000-0000-0000-000000000001', '971500000401')) v where v->>'code' = 'JUSTYOU') then
    raise exception 'personal flag missing'; end if;
  if pg_temp.codes('971500000402') <> array['PUBLIC'] then raise exception 'non-recipient saw personal code'; end if;
  -- Same phone at another cafe does not inherit the assignment.
  if 'JUSTYOU' = any(pg_temp.codes('971500000401', '29800000-0000-0000-0000-000000000002')) then
    raise exception 'assignment leaked to another cafe'; end if;

  -- Usage preview reports the assignment.
  usage := public.get_promo_code_usage('29800000-0000-0000-0000-000000000001', '49800000-0000-0000-0000-000000000001', '971500000401');
  if not (usage->>'customer_assigned')::boolean then raise exception 'assigned not reported: %', usage; end if;
  usage := public.get_promo_code_usage('29800000-0000-0000-0000-000000000001', '49800000-0000-0000-0000-000000000001', '971500000402');
  if (usage->>'customer_assigned')::boolean then raise exception 'non-recipient reported assigned'; end if;
  if (public.get_promo_code_usage('29800000-0000-0000-0000-000000000001', '49800000-0000-0000-0000-000000000002', null)->>'customer_assigned')::boolean then
    raise exception 'blank phone reported assigned'; end if;

  -- Redemption: a non-recipient is refused and NO order is saved.
  select count(*) into orders_before from public.orders where restaurant_id = '29800000-0000-0000-0000-000000000001';
  perform pg_temp.fails_with($q$select pg_temp.place('971500000402', 'JUSTYOU', 'personal-1')$q$, 'Promo code is not valid');
  if (select count(*) from public.orders where restaurant_id = '29800000-0000-0000-0000-000000000001') <> orders_before then
    raise exception 'refused redemption left an order behind'; end if;

  -- A brand-new phone (no customers row yet) is refused too.
  perform pg_temp.fails_with($q$select pg_temp.place('971500000499', 'JUSTYOU', 'personal-2')$q$, 'Promo code is not valid');

  -- The recipient can redeem; the per-customer limit then applies as usual.
  perform pg_temp.place('971500000401', 'JUSTYOU', 'personal-3');
  if (select count(*) from public.promo_code_redemptions where promo_code_id = '49800000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'recipient redemption missing'; end if;
  perform pg_temp.fails_with($q$select pg_temp.place('971500000401', 'JUSTYOU', 'personal-4')$q$, 'already used');
  if 'JUSTYOU' = any(pg_temp.codes('971500000401')) then raise exception 'used-up personal code still shown'; end if;

  -- Public codes are unaffected by the trigger.
  perform pg_temp.place('971500000402', 'PUBLIC', 'personal-5');

  -- Deleting the customer removes their assignments.
  delete from public.customers where id = '39800000-0000-0000-0000-000000000002';
  insert into public.promo_code_assignments (restaurant_id, promo_code_id, customer_id)
  values ('29800000-0000-0000-0000-000000000002', '49800000-0000-0000-0000-000000000003', '39800000-0000-0000-0000-000000000003');
  delete from public.customers where id = '39800000-0000-0000-0000-000000000003';
  if exists (select 1 from public.promo_code_assignments where customer_id = '39800000-0000-0000-0000-000000000003') then
    raise exception 'assignment survived customer deletion'; end if;
end $$;

do $$ begin
  if has_table_privilege('authenticated', 'public.promo_code_assignments', 'insert')
     or has_table_privilege('anon', 'public.promo_code_assignments', 'select') then
    raise exception 'promo_code_assignments grants too broad';
  end if;
  if (select column_default from information_schema.columns
      where table_name = 'promo_codes' and column_name = 'audience') <> '''everyone''::text' then
    raise exception 'audience must default to everyone';
  end if;
end $$;

rollback;
