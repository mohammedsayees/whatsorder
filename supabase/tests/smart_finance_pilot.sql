\set ON_ERROR_STOP on
begin;

-- The legacy test fixture seeds the production pilot slug. Rename it only
-- inside this rolled-back transaction so this test owns a minimal pilot menu.
update public.restaurants set slug = 'chaixpress-existing-test-fixture' where slug = 'chaixpress';

insert into auth.users (id, email, role, aud, created_at, updated_at) values
  ('1e000000-0000-0000-0000-000000000001', 'pilot-owner@test.invalid', 'authenticated', 'authenticated', now(), now());
insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active, finance_enabled) values
  ('2e000000-0000-0000-0000-000000000001', 'Chai Xpress Pilot', 'chaixpress', '971500000098', 'live', true, true),
  ('2e000000-0000-0000-0000-000000000002', 'Pilot Other', 'pilot-other', '971500000099', 'live', true, true);
insert into public.restaurant_users (restaurant_id, user_id, email, role, accepted_at) values
  ('2e000000-0000-0000-0000-000000000001', '1e000000-0000-0000-0000-000000000001', 'pilot-owner@test.invalid', 'owner', now());
-- Dates below are restaurant business dates (restaurants.time_zone), matching the
-- functions under test; the session's current_date can differ by a day.
select (now() at time zone time_zone)::date as business_today
from public.restaurants where id = '2e000000-0000-0000-0000-000000000001' \gset

set local role service_role;
insert into public.finance_pilot_enrollments (restaurant_id) values
  ('2e000000-0000-0000-0000-000000000001'),
  ('2e000000-0000-0000-0000-000000000002');
insert into public.menu_categories (id, restaurant_id, name) values
  ('3e000000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001', 'Pilot food');
insert into public.menu_items (id, restaurant_id, category_id, name, price) values
  ('4e000000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001', '3e000000-0000-0000-0000-000000000001', 'Pilot chai', 10);
insert into public.finance_recurring_costs (
  restaurant_id, category_id, description, amount_fils, frequency, start_on, next_due_on
) values (
  '2e000000-0000-0000-0000-000000000001',
  (select id from public.finance_categories where restaurant_id = '2e000000-0000-0000-0000-000000000001'
    and name = 'Rent'),
  'Pilot rent', 100000, 'monthly', :'business_today', :'business_today'
);
insert into public.finance_ingredients (
  id, restaurant_id, name, canonical_unit, yield_pct, created_by, updated_by
) values (
  '6e000000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001',
  'Tea', 'g', 100, '1e000000-0000-0000-0000-000000000001', '1e000000-0000-0000-0000-000000000001'
);
select public.confirm_finance_purchase_price(
  '2e000000-0000-0000-0000-000000000001', '6e000000-0000-0000-0000-000000000001', null,
  'Pilot supplier', :'business_today', 1, 1, 'kg', 2000, '1e000000-0000-0000-0000-000000000001'
);
select public.create_finance_recipe_revision(
  '2e000000-0000-0000-0000-000000000001', '4e000000-0000-0000-0000-000000000001', null,
  :'business_today', '[{"ingredient_id":"6e000000-0000-0000-0000-000000000001","canonical_quantity":10,"waste_pct":0}]',
  '1e000000-0000-0000-0000-000000000001'
);
insert into public.orders (
  id, restaurant_id, customer_name, customer_phone, fulfilment_type, payment_method,
  items, subtotal, delivery_fee, total, status, whatsapp_message,
  consent_order_processing, consent_timestamp
) values (
  '7e000000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001',
  'Pilot test', '971500000100', 'takeaway', 'Cash on Delivery',
  '[{"item_id":"4e000000-0000-0000-0000-000000000001","name":"Pilot chai","price":10,"quantity":1}]',
  10, 0, 10, 'Completed', 'test', true, now()
);

do $pilot_gate_checks$
declare readiness jsonb; business_today date;
begin
  select (now() at time zone time_zone)::date into strict business_today
  from public.restaurants where id = '2e000000-0000-0000-0000-000000000001';
  readiness := public.get_finance_pilot_readiness('2e000000-0000-0000-0000-000000000001');
  if not (readiness->>'ready_for_release')::boolean or (readiness->>'coverage_pct')::numeric <> 100 then
    raise exception 'Complete pilot fixtures did not satisfy readiness gate: %', readiness;
  end if;
  begin
    perform public.advance_finance_pilot(
      '2e000000-0000-0000-0000-000000000001', 'released', business_today, business_today,
      '1e000000-0000-0000-0000-000000000001'
    );
    raise exception 'Pilot released without reconciliation';
  exception when others then
    if sqlerrm = 'Pilot released without reconciliation' then raise; end if;
  end;
  perform public.advance_finance_pilot(
    '2e000000-0000-0000-0000-000000000001', 'configured', null, null,
    '1e000000-0000-0000-0000-000000000001'
  );
  perform public.advance_finance_pilot(
    '2e000000-0000-0000-0000-000000000001', 'reconciled', business_today, business_today,
    '1e000000-0000-0000-0000-000000000001'
  );
  perform public.advance_finance_pilot(
    '2e000000-0000-0000-0000-000000000001', 'released', business_today, business_today,
    '1e000000-0000-0000-0000-000000000001'
  );
  if not exists (select 1 from public.finance_pilot_enrollments
    where restaurant_id = '2e000000-0000-0000-0000-000000000001' and status = 'released') then
    raise exception 'Reconciled pilot did not release';
  end if;
  if not exists (select 1 from public.finance_audit_events
    where restaurant_id = '2e000000-0000-0000-0000-000000000001' and entity_type = 'pilot_enrollment') then
    raise exception 'Pilot state changes were not audited';
  end if;
end;
$pilot_gate_checks$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-0000-0000-000000000001', true);
do $pilot_rls_checks$
begin
  if (select count(*) from public.finance_pilot_enrollments) <> 1 then
    raise exception 'Pilot enrollment crossed tenant boundary';
  end if;
  begin
    update public.finance_pilot_enrollments set status = 'paused'
    where restaurant_id = '2e000000-0000-0000-0000-000000000001';
    raise exception 'Authenticated pilot write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('authenticated',
    'public.advance_finance_pilot(uuid,text,date,date,uuid)', 'execute') then
    raise exception 'Pilot advancement RPC exposed to authenticated role';
  end if;
end;
$pilot_rls_checks$;

rollback;
