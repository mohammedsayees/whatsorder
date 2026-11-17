\set ON_ERROR_STOP on
-- Rollback-only checks for the Smart Finance risk fixes (20261120150000).
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at) values
  ('19000000-0000-0000-0000-000000000001', 'risk-owner@test.invalid', 'authenticated', 'authenticated', now(), now());
insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active, finance_enabled, currency_code, time_zone) values
  ('29000000-0000-0000-0000-000000000001', 'Risk Finance', 'risk-finance', '971500000095', 'live', true, true, 'AED', 'Asia/Dubai'),
  ('29000000-0000-0000-0000-000000000002', 'Risk Plain', 'risk-plain', '971500000096', 'live', true, false, 'AED', 'Asia/Dubai');
insert into public.restaurant_users (restaurant_id, user_id, email, role, accepted_at) values
  ('29000000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', 'risk-owner@test.invalid', 'owner', now());
select (now() at time zone 'Asia/Dubai')::date as business_today \gset

set local role service_role;
insert into public.menu_categories (id, restaurant_id, name) values
  ('39000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'Food'),
  ('39000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000002', 'Food');
insert into public.menu_items (id, restaurant_id, category_id, name, price) values
  ('49000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', 'Rice bowl', 20),
  ('49000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', 'Old bowl', 20),
  ('49000000-0000-0000-0000-000000000003', '29000000-0000-0000-0000-000000000002', '39000000-0000-0000-0000-000000000002', 'Plain bowl', 20);
insert into public.finance_ingredients (id, restaurant_id, name, canonical_unit, yield_pct) values
  ('59000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'Rice', 'g', 100),
  ('59000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000001', 'Old stock', 'g', 100);
-- Rice: AED 100/kg 200 days ago, AED 50/kg 10 days ago. Old stock: only 200 days ago.
select public.confirm_finance_purchase_price('29000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001', null,
  'S', (:'business_today'::date - 200), 1, 1, 'kg', 10000, '19000000-0000-0000-0000-000000000001');
select public.confirm_finance_purchase_price('29000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000001', null,
  'S', (:'business_today'::date - 10), 1, 1, 'kg', 5000, '19000000-0000-0000-0000-000000000001');
select public.confirm_finance_purchase_price('29000000-0000-0000-0000-000000000001', '59000000-0000-0000-0000-000000000002', null,
  'S', (:'business_today'::date - 200), 1, 1, 'kg', 8000, '19000000-0000-0000-0000-000000000001');
select public.create_finance_recipe_revision('29000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000001', null,
  :'business_today', '[{"ingredient_id":"59000000-0000-0000-0000-000000000001","canonical_quantity":100,"waste_pct":0}]',
  '19000000-0000-0000-0000-000000000001');
select public.create_finance_recipe_revision('29000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000002', null,
  :'business_today', '[{"ingredient_id":"59000000-0000-0000-0000-000000000002","canonical_quantity":100,"waste_pct":0}]',
  '19000000-0000-0000-0000-000000000001');
update public.finance_settings set cost_basis = 'weighted_average'
where restaurant_id = '29000000-0000-0000-0000-000000000001';
-- Changing the yield today must not change costs of prices confirmed earlier.
update public.finance_ingredients set yield_pct = 50 where id = '59000000-0000-0000-0000-000000000001';

insert into public.orders (
  id, restaurant_id, customer_name, customer_phone, fulfilment_type, payment_method,
  items, subtotal, delivery_fee, total, status, whatsapp_message, consent_order_processing, consent_timestamp
) values
  ('69000000-0000-0000-0000-000000000001', '29000000-0000-0000-0000-000000000001', 'A', '971500000097', 'takeaway', 'Cash on Delivery',
   '[{"item_id":"49000000-0000-0000-0000-000000000001","name":"Rice bowl","price":20,"quantity":1}]', 20, 0, 20, 'Completed', 'x', true, now()),
  ('69000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000001', 'B', '971500000098', 'takeaway', 'Cash on Delivery',
   '[{"item_id":"49000000-0000-0000-0000-000000000002","name":"Old bowl","price":20,"quantity":1}]', 20, 0, 20, 'Completed', 'x', true, now()),
  -- Malformed quantity: costing fails, but the order must still be saved as Completed.
  ('69000000-0000-0000-0000-000000000003', '29000000-0000-0000-0000-000000000001', 'C', '971500000099', 'takeaway', 'Cash on Delivery',
   '[{"item_id":"49000000-0000-0000-0000-000000000001","name":"Rice bowl","price":20,"quantity":"1.5"}]', 30, 0, 30, 'Completed', 'x', true, now()),
  -- Finance off: no costing work at all.
  ('69000000-0000-0000-0000-000000000004', '29000000-0000-0000-0000-000000000002', 'D', '971500000100', 'takeaway', 'Cash on Delivery',
   '[{"item_id":"49000000-0000-0000-0000-000000000003","name":"Plain bowl","price":20,"quantity":1}]', 20, 0, 20, 'Completed', 'x', true, now());

do $risk_checks$
declare
  r constant uuid := '29000000-0000-0000-0000-000000000001';
  owner_id constant uuid := '19000000-0000-0000-0000-000000000001';
  category uuid;
  cost_id uuid;
  resumed_id uuid;
  expense_id_v uuid;
  again uuid;
  sid uuid;
  paid_out uuid;
  bill uuid;
begin
  -- 5: weighted average uses only the last 90 days (AED 50/kg → 5 fils/g × 100 g).
  if not exists (select 1 from public.finance_product_cost_snapshots
                 where order_id = '69000000-0000-0000-0000-000000000001'
                   and completeness = 'complete' and unit_direct_cost_fils = 500) then
    raise exception '90-day weighted average is wrong: %', (select row_to_json(s) from public.finance_product_cost_snapshots s
      where order_id = '69000000-0000-0000-0000-000000000001');
  end if;
  -- ...and falls back to the latest price when nothing was bought in 90 days.
  if not exists (select 1 from public.finance_product_cost_snapshots
                 where order_id = '69000000-0000-0000-0000-000000000002'
                   and completeness = 'complete' and unit_direct_cost_fils = 800) then
    raise exception 'Weighted average did not fall back to the latest price';
  end if;

  -- 1: a costing error never blocks completing an order; Finance-off tenants skip it.
  if (select status from public.orders where id = '69000000-0000-0000-0000-000000000003') <> 'Completed'
     or exists (select 1 from public.finance_product_cost_snapshots where order_id = '69000000-0000-0000-0000-000000000003') then
    raise exception 'Costing error changed the order outcome';
  end if;
  if exists (select 1 from public.finance_product_cost_snapshots where order_id = '69000000-0000-0000-0000-000000000004') then
    raise exception 'Costing ran for a restaurant without Finance';
  end if;

  -- 3: pausing dates the pause; resuming starts a new schedule and keeps history.
  select id into category from public.finance_categories where restaurant_id = r and name = 'Rent';
  insert into public.finance_recurring_costs (restaurant_id, category_id, description, amount_fils, frequency,
    start_on, next_due_on, created_by, updated_by)
  values (r, category, 'Rent', 1000000, 'monthly', current_date - 60, current_date - 60, owner_id, owner_id)
  returning id into cost_id;
  if not public.pause_finance_recurring_cost(r, cost_id, owner_id) then raise exception 'Pause failed'; end if;
  if (select paused_on from public.finance_recurring_costs where id = cost_id) is null then
    raise exception 'Pause was not dated';
  end if;
  resumed_id := public.resume_finance_recurring_cost(r, cost_id, owner_id);
  if (select superseded_by from public.finance_recurring_costs where id = cost_id) <> resumed_id
     or not (select is_active from public.finance_recurring_costs where id = resumed_id)
     or (select start_on from public.finance_recurring_costs where id = resumed_id) <> (now() at time zone 'Asia/Dubai')::date then
    raise exception 'Resume did not start a new schedule';
  end if;
  begin
    perform public.resume_finance_recurring_cost(r, cost_id, owner_id);
    raise exception 'Resumed the same paused schedule twice';
  exception when others then
    if sqlerrm not like '%cannot be resumed%' then raise; end if;
  end;

  -- 4: a scanned bill can carry a service period and recurring link; repeat submits are idempotent.
  insert into public.finance_documents (id, restaurant_id, storage_path, original_name, mime_type, byte_size, file_hash, status)
  values ('79000000-0000-0000-0000-000000000001', r, r::text || '/dewa.pdf', 'dewa.pdf', 'application/pdf', 100, repeat('f', 64), 'extracted'),
         ('79000000-0000-0000-0000-000000000002', r, r::text || '/bad.pdf', 'bad.pdf', 'application/pdf', 100, repeat('e', 64), 'extracted');
  expense_id_v := public.approve_finance_document_v2(r, '79000000-0000-0000-0000-000000000001', category,
    'DEWA', 'D-1', current_date, 40000, 2000, 42000, false, 'partial', 'bank_transfer', current_date, 10000,
    'October utilities', '[]'::jsonb, date '2026-10-01', date '2026-10-31', resumed_id, owner_id);
  if not exists (select 1 from public.finance_expenses where id = expense_id_v
                 and service_period_start = date '2026-10-01' and service_period_end = date '2026-10-31'
                 and recurring_cost_id = resumed_id and payment_status = 'partial' and paid_amount_fils = 10000) then
    raise exception 'Scanned bill details were not saved';
  end if;
  again := public.approve_finance_document_v2(r, '79000000-0000-0000-0000-000000000001', category,
    'DEWA', 'D-1', current_date, 40000, 2000, 42000, false, 'paid', 'cash', current_date, null,
    'Changed', '[]'::jsonb, null, null, null, owner_id);
  if again <> expense_id_v or (select payment_status from public.finance_expenses where id = expense_id_v) <> 'partial' then
    raise exception 'Repeat submit was not idempotent';
  end if;
  begin
    perform public.approve_finance_document_v2(r, '79000000-0000-0000-0000-000000000002', category,
      null, null, current_date, 1000, 0, 1000, false, 'unpaid', '', null, null, 'Bad', '[]'::jsonb,
      date '2026-10-31', date '2026-10-01', null, owner_id);
    raise exception 'Backwards service period accepted';
  exception when others then
    if sqlerrm not like '%Invalid service period%' then raise; end if;
  end;
  if exists (select 1 from public.finance_expenses where source_document_id = '79000000-0000-0000-0000-000000000002')
     or (select status from public.finance_documents where id = '79000000-0000-0000-0000-000000000002') <> 'extracted' then
    raise exception 'Refused bill left changes behind';
  end if;

  -- 7: a short till paid-out records the amount actually paid.
  sid := public.open_restaurant_shift_v2(r, 'Morning', 100, null, owner_id);
  paid_out := public.add_shift_cash_paid_out(r, sid, 30, 'Part payment', owner_id);
  insert into public.finance_expenses (restaurant_id, category_id, description, incurred_on,
    subtotal_fils, input_vat_fils, total_fils, status, approved_by, approved_at, created_by, updated_by)
  values (r, category, 'Supplier bill', current_date, 5000, 0, 5000, 'approved', owner_id, now(), owner_id, owner_id)
  returning id into bill;
  perform public.link_finance_paid_out_to_expense(r, paid_out, bill, true, 'Rest by bank', owner_id);
  if not exists (select 1 from public.finance_expenses where id = bill and payment_status = 'partial' and paid_amount_fils = 3000) then
    raise exception 'Partial link did not record the amount paid';
  end if;
  begin
    update public.finance_expenses set payment_status = 'paid', paid_amount_fils = 3000 where id = bill;
    raise exception 'Paid amount accepted on a fully paid expense';
  exception when check_violation then null;
  end;

  -- 6: pilot controls require an enrollment, not a particular store link.
  begin
    perform public.advance_finance_pilot(r, 'configured', null, null, owner_id);
    raise exception 'Pilot advanced without an enrollment';
  exception when others then
    if sqlerrm not like '%not enrolled in the Finance pilot%' then raise; end if;
  end;

  if has_function_privilege('authenticated', 'public.approve_finance_document_v2(uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,boolean,text,text,date,bigint,text,jsonb,date,date,uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.resume_finance_recurring_cost(uuid,uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public.finance_apply_expense_details(uuid,uuid,date,date,uuid,bigint,uuid)', 'execute') then
    raise exception 'Risk-fix RPCs exposed to browser roles';
  end if;
end;
$risk_checks$;

rollback;
