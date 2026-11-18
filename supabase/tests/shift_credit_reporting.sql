-- Rollback-only: credit sales and repayments in shift and business-day reports.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at)
values ('19100000-0000-0000-0000-000000000001', 'credit-report@test.invalid',
  'authenticated', 'authenticated', now(), now());
insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active)
values ('29100000-0000-0000-0000-000000000001', 'Credit report test',
  'credit-report-test', '971500000191', 'live', true),
  ('29100000-0000-0000-0000-000000000002', 'Other tenant',
  'credit-report-other', '971500000192', 'live', true);
insert into public.restaurant_users (restaurant_id, user_id, email, role, accepted_at)
values ('29100000-0000-0000-0000-000000000001',
  '19100000-0000-0000-0000-000000000001', 'credit-report@test.invalid', 'manager', now());
insert into public.customers (
  id, restaurant_id, name, phone, delivery_area, delivery_address,
  consent_order_processing, consent_timestamp
) values (
  '59100000-0000-0000-0000-000000000001', '29100000-0000-0000-0000-000000000001',
  'Report Credit Customer', '971500000193', '', '', true, now()
);

do $credit_report$
declare
  r constant uuid := '29100000-0000-0000-0000-000000000001';
  manager constant uuid := '19100000-0000-0000-0000-000000000001';
  customer constant uuid := '59100000-0000-0000-0000-000000000001';
  sid uuid;
  day_id uuid;
  v1 jsonb;
  day_report jsonb;
begin
  sid := public.open_restaurant_shift_v2(r, 'Morning', 0, null, manager);
  select business_day_id into day_id from public.restaurant_shifts where id = sid;
  perform public.configure_customer_credit_account(r, customer, true, 100, 7, true, 0, manager);

  insert into public.orders (
    id, restaurant_id, customer_id, customer_name, customer_phone, fulfilment_type,
    payment_method, items, subtotal, delivery_fee, total, status,
    whatsapp_message, consent_order_processing, consent_timestamp, shift_id
  ) values (
    '49100000-0000-0000-0000-000000000001', r, customer, 'Report Credit Customer',
    '971500000193', 'takeaway', null, '[]', 10, 0, 10, 'Preparing', 'test', true, now(), null
  ), (
    '49100000-0000-0000-0000-000000000002', r, null, 'Walk-in', '', 'takeaway',
    'Cash on Delivery', '[]', 20, 0, 20, 'Completed', 'test', true, now(), sid
  );
  -- Another tenant's credit-looking order must never appear.
  insert into public.orders (
    id, restaurant_id, customer_name, customer_phone, fulfilment_type,
    payment_method, items, subtotal, delivery_fee, total, status,
    whatsapp_message, consent_order_processing, consent_timestamp
  ) values (
    '49100000-0000-0000-0000-000000000009', '29100000-0000-0000-0000-000000000002',
    'Other', '', 'takeaway', 'Cash on Delivery', '[]', 99, 0, 99, 'Completed',
    'test', true, now()
  );

  perform public.record_customer_credit_order(r, '49100000-0000-0000-0000-000000000001', manager);
  perform public.record_customer_credit_payment(r, customer, 4, 'cash', 'Part payment', manager);

  -- Expected cash = 0 opening + 20 cash sale + 4 cash repayment.
  perform public.close_restaurant_shift_v4(r, sid, 24, 0, null, '[]'::jsonb, null, manager);

  select snapshot into v1 from public.shift_close_reports where shift_id = sid and version = 1;
  if jsonb_array_length(v1->'credit_sales') <> 1
     or (v1->'credit_sales'->0->>'order_id')::uuid <> '49100000-0000-0000-0000-000000000001'
     or (v1->'credit_sales'->0->>'customer_id')::uuid <> customer
     or (v1->'credit_sales'->0->>'amount')::numeric <> 10
     or v1->'credit_sales'->0->>'due_date' is null
     or v1::text like '%Report Credit Customer%' then
    raise exception 'Shift report credit sales are wrong (or store a customer name): %', v1->'credit_sales';
  end if;
  if (select count(*) from jsonb_array_elements(v1->'other_income_entries') e
      where e->>'category' = 'customer_credit_repayment' and (e->>'amount')::numeric = 4
        and e->>'payment_method' = 'cash') <> 1 then
    raise exception 'Shift report is missing the credit repayment';
  end if;
  if (select close_report_snapshot from public.restaurant_shifts where id = sid) <> v1 then
    raise exception 'Shift row snapshot differs from its latest version';
  end if;

  perform public.close_business_day(r, day_id, manager);
  select snapshot into day_report from public.business_day_close_reports
  where business_day_id = day_id and version = 1;
  if (day_report->'credit'->>'sold_order_count')::integer <> 1
     or (day_report->'credit'->>'sold_total')::numeric <> 10
     or (day_report->'credit'->>'collected_total')::numeric <> 4
     or (day_report->'credit'->'collected_by_method'->>'cash')::numeric <> 4
     or (day_report->'credit'->>'outstanding_at_close')::numeric <> 6 then
    raise exception 'Business day credit block is wrong: %', day_report->'credit';
  end if;
  if (select close_report_snapshot from public.business_days where id = day_id) <> day_report then
    raise exception 'Business day row snapshot differs from its report';
  end if;

  if has_function_privilege('authenticated', 'public.business_day_credit_summary(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public.business_day_credit_summary(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.shift_report_itemized_entries(uuid,uuid)', 'execute') then
    raise exception 'Credit report helpers exposed to API roles';
  end if;
end;
$credit_report$;

rollback;
