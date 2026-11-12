-- Rollback-only checks: closed shift reports follow payment corrections and
-- late offline receipts, and credit repayments are not counted twice.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at) values
  ('15000000-0000-0000-0000-000000000001', 'live-recalc-staff@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('15000000-0000-0000-0000-000000000002', 'live-recalc-manager@test.invalid', 'authenticated', 'authenticated', now(), now());

insert into public.restaurants (
  id, name, slug, whatsapp_number, status, is_active, country_code,
  currency_code, locale, time_zone, phone_country_code, shift_marketplace_channels
) values (
  '25000000-0000-0000-0000-000000000001', 'Live Recalc', 'live-recalc',
  '971500000091', 'live', true, 'AE', 'AED', 'en-AE', 'Asia/Dubai', '971', '{}'::text[]
);

insert into public.restaurant_users (id, restaurant_id, user_id, email, role, accepted_at) values
  ('35000000-0000-0000-0000-000000000001', '25000000-0000-0000-0000-000000000001',
   '15000000-0000-0000-0000-000000000001', 'live-recalc-staff@test.invalid', 'staff', now()),
  ('35000000-0000-0000-0000-000000000002', '25000000-0000-0000-0000-000000000001',
   '15000000-0000-0000-0000-000000000002', 'live-recalc-manager@test.invalid', 'manager', now());

do $$
declare
  r constant uuid := '25000000-0000-0000-0000-000000000001';
  staff constant uuid := '15000000-0000-0000-0000-000000000001';
  manager constant uuid := '15000000-0000-0000-0000-000000000002';
  sid uuid;
  day_id uuid;
  saved public.restaurant_shifts%rowtype;
  late_order public.orders%rowtype;
  version_count integer;
  versions_before integer;
begin
  sid := public.open_restaurant_shift_v2(r, 'Morning', 50, null, staff);
  select business_day_id into day_id from public.restaurant_shifts where id = sid;
  -- now() is fixed inside this transaction; give the shift a real time window.
  update public.restaurant_shifts set opened_at = now() - interval '1 hour' where id = sid;

  insert into public.orders (
    id, restaurant_id, customer_name, customer_phone, fulfilment_type, items,
    subtotal, delivery_fee, total, status, payment_method, whatsapp_message,
    consent_order_processing, consent_timestamp, source, shift_id
  ) values
    ('45000000-0000-0000-0000-000000000001', r, 'Cash buyer', '', 'takeaway', '[]',
      10, 0, 10, 'Completed', 'Cash on Delivery', 'test', true, now(), 'customer', sid),
    ('45000000-0000-0000-0000-000000000002', r, 'Card buyer', '', 'takeaway', '[]',
      20, 0, 20, 'Completed', 'Card on Delivery', 'test', true, now(), 'customer', sid);

  perform public.add_shift_other_income(r, sid, 'used_oil_sale', 5, 'cash', 'Oil', null, staff);
  insert into public.shift_other_income_entries (
    restaurant_id, shift_id, category, amount, payment_method, description, recorded_by_user_id
  ) values (r, sid, 'customer_credit_repayment', 15, 'cash', 'Credit repayment', manager);

  -- Expected cash = 50 opening + 10 cash order + 5 oil + 15 repayment = 80.
  perform public.close_restaurant_shift_v3(r, sid, 80, 20, null, '[]'::jsonb, null, staff);
  select * into saved from public.restaurant_shifts where id = sid;
  if saved.expected_cash_amount <> 80 or saved.difference_amount <> 0
     or saved.card_difference_amount <> 0 then
    raise exception 'Baseline close did not reconcile: %', row_to_json(saved);
  end if;
  -- Item 3: sales 30 + other income 20 - repayment 15 (already counted as a sale).
  if (saved.close_report_snapshot->>'combined_operational_receipts')::numeric <> 35
     or (saved.close_report_snapshot->>'credit_repayment_total')::numeric <> 15 then
    raise exception 'Credit repayment counted twice in receipts: %', saved.close_report_snapshot;
  end if;

  -- Staff still cannot correct a closed shift.
  begin
    perform public.record_order_payment(r, '45000000-0000-0000-0000-000000000002', 'Cash on Delivery', false, staff);
    raise exception 'Staff corrected a closed shift payment';
  exception when others then
    if sqlerrm not like '%Only management can correct a closed shift payment%' then raise; end if;
  end;

  -- Item 1: manager corrects the card order to cash after close.
  perform public.record_order_payment(r, '45000000-0000-0000-0000-000000000002', 'Cash on Delivery', false, manager);
  select * into saved from public.restaurant_shifts where id = sid;
  if saved.close_report_version <> 2 or saved.expected_cash_amount <> 100
     or saved.difference_amount <> -20 or saved.card_on_delivery_total <> 0
     or saved.card_difference_amount <> 20 or saved.completed_cash_order_total <> 30
     or saved.cash_counted_amount <> 80 or saved.card_terminal_total <> 20 then
    raise exception 'Payment correction did not recalculate the shift: %', row_to_json(saved);
  end if;
  if (saved.close_report_snapshot->>'expected_cash_amount')::numeric <> 100
     or (saved.close_report_snapshot->>'cash_difference_amount')::numeric <> -20
     or (saved.close_report_snapshot->>'expected_card_amount')::numeric <> 0
     or saved.close_report_snapshot->>'correction_reason' not like '%corrected from Card to Cash%'
     or (saved.close_report_snapshot->>'combined_operational_receipts')::numeric <> 35 then
    raise exception 'Corrected snapshot is stale: %', saved.close_report_snapshot;
  end if;
  if not exists (
    select 1 from public.shift_close_reports
    where shift_id = saved.id and version = 2 and created_by_user_id = manager
      and snapshot = saved.close_report_snapshot
  ) or (select (snapshot->>'expected_cash_amount')::numeric from public.shift_close_reports
        where shift_id = saved.id and version = 1) <> 80 then
    raise exception 'Report history was not preserved as versions';
  end if;

  -- Item 2: an offline cash receipt punched during the shift syncs after close.
  insert into public.orders (
    id, restaurant_id, customer_name, customer_phone, fulfilment_type, items,
    subtotal, delivery_fee, total, status, payment_method, whatsapp_message,
    consent_order_processing, consent_timestamp, punched_at, source
  ) values (
    '45000000-0000-0000-0000-000000000003', r, 'Offline', '', 'takeaway', '[]',
    7, 0, 7, 'Completed', 'Cash on Delivery', 'test', true, now(),
    now() - interval '30 minutes', 'staff'
  );
  select * into late_order from public.orders where id = '45000000-0000-0000-0000-000000000003';
  select * into saved from public.restaurant_shifts where id = sid;
  if not late_order.late_shift_entry or late_order.shift_id <> sid
     or saved.close_report_version <> 3 or saved.expected_cash_amount <> 107
     or saved.completed_sales <> 37 or saved.completed_order_count <> 3
     or saved.close_report_snapshot->>'correction_reason' not like '%offline receipt%'
     or late_order.created_at > saved.close_report_generated_at then
    raise exception 'Late receipt was not folded into its shift: %', row_to_json(saved);
  end if;
  if not exists (
    select 1 from public.shift_close_reports
    where shift_id = saved.id and version = 3 and created_by_user_id is null
  ) then
    raise exception 'Automatic version must not claim a human actor';
  end if;

  -- A manual revision with no drift adds exactly one version.
  perform public.revise_restaurant_shift_close_report_v2(
    r, sid, 107, 0, null, '[]'::jsonb, 'Recounted drawer', manager);
  select * into saved from public.restaurant_shifts where id = sid;
  if saved.close_report_version <> 4 or saved.difference_amount <> 0
     or saved.card_difference_amount <> 0
     or (saved.close_report_snapshot->>'combined_operational_receipts')::numeric <> 42 then
    raise exception 'Manual revision is wrong: %', row_to_json(saved);
  end if;

  -- Drift from a pre-fix correction is recalculated before a manual revision.
  update public.orders set payment_method = 'Card on Delivery'
  where id = '45000000-0000-0000-0000-000000000001';
  perform public.revise_restaurant_shift_close_report_v2(
    r, sid, 97, 10, null, '[]'::jsonb, 'Recounted again', manager);
  select * into saved from public.restaurant_shifts where id = sid;
  if saved.close_report_version <> 6 or saved.expected_cash_amount <> 97
     or saved.card_on_delivery_total <> 10 or saved.difference_amount <> 0
     or saved.card_difference_amount <> 0
     or saved.close_report_snapshot->>'correction_reason' <> 'Recounted again'
     or (select correction_reason from public.shift_close_reports
         where shift_id = saved.id and version = 5) not like 'Automatic:%' then
    raise exception 'Revision did not recalculate drift first: %', row_to_json(saved);
  end if;

  -- An unauthorized revision must not leave an automatic version behind.
  begin
    perform public.revise_restaurant_shift_close_report_v2(
      r, sid, 97, 10, null, '[]'::jsonb, 'Staff try', staff);
    raise exception 'Staff revised a closed shift';
  exception when others then
    if sqlerrm not like '%Only restaurant management%' then raise; end if;
  end;

  -- Item 3 at business-day level.
  perform public.close_business_day(r, day_id, manager);
  if (select (close_report_snapshot->>'total_operational_receipts')::numeric
      from public.business_days where id = day_id) <> 42
     or (select (close_report_snapshot->>'credit_repayment_total')::numeric
      from public.business_days where id = day_id) <> 15 then
    raise exception 'Business day counted credit repayments twice';
  end if;

  -- A closed business day is final: corrections are refused, late receipts stay addenda.
  begin
    perform public.record_order_payment(r, '45000000-0000-0000-0000-000000000002', 'Card on Delivery', false, manager);
    raise exception 'Closed business day payment was corrected';
  exception when others then
    if sqlerrm not like '%closed business day%' then raise; end if;
  end;
  if (select payment_method::text from public.orders
      where id = '45000000-0000-0000-0000-000000000002') <> 'Cash on Delivery' then
    raise exception 'Refused correction was not rolled back';
  end if;

  select count(*) into versions_before from public.shift_close_reports where shift_id = saved.id;
  insert into public.orders (
    id, restaurant_id, customer_name, customer_phone, fulfilment_type, items,
    subtotal, delivery_fee, total, status, payment_method, whatsapp_message,
    consent_order_processing, consent_timestamp, punched_at, source
  ) values (
    '45000000-0000-0000-0000-000000000004', r, 'Very late', '', 'takeaway', '[]',
    4, 0, 4, 'Completed', 'Cash on Delivery', 'test', true, now(),
    now() - interval '20 minutes', 'staff'
  );
  select count(*) into version_count from public.shift_close_reports where shift_id = saved.id;
  if version_count <> versions_before
     or (select close_report_version from public.restaurant_shifts where id = sid) <> 6
     or not (select late_shift_entry from public.orders where id = '45000000-0000-0000-0000-000000000004') then
    raise exception 'Late receipt rewrote a closed business day shift';
  end if;

  if has_function_privilege('service_role',
       'public.refresh_closed_shift_report(uuid,uuid,text,uuid,boolean)', 'execute')
     or has_function_privilege('authenticated',
       'public.refresh_closed_shift_report(uuid,uuid,text,uuid,boolean)', 'execute')
     or has_function_privilege('authenticated',
       'public.record_order_payment(uuid,uuid,text,boolean,uuid)', 'execute') then
    raise exception 'Internal recalculation exposed to API roles';
  end if;
end $$;

rollback;
