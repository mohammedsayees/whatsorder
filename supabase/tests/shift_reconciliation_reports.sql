-- Rollback-only integration checks for shift reconciliation and report history.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at)
values
  ('13000000-0000-0000-0000-000000000001', 'shift-report-staff@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('13000000-0000-0000-0000-000000000002', 'shift-report-manager@test.invalid', 'authenticated', 'authenticated', now(), now());

insert into public.restaurants (
  id, name, slug, whatsapp_number, status, is_active, country_code,
  currency_code, locale, time_zone, phone_country_code,
  shift_marketplace_channels
)
values
  (
    '23000000-0000-0000-0000-000000000001', 'Report Tenant UAE',
    'report-tenant-uae', '971500000041', 'live', true, 'AE', 'AED',
    'en-AE', 'Asia/Dubai', '971', array['talabat', 'noon', 'deliveroo']
  ),
  (
    '23000000-0000-0000-0000-000000000002', 'Report Tenant India',
    'report-tenant-india', '919800000041', 'live', true, 'IN', 'INR',
    'en-IN', 'Asia/Kolkata', '91', '{}'::text[]
  );

insert into public.restaurant_users (
  id, restaurant_id, user_id, email, role, accepted_at
)
values
  (
    '33000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    '13000000-0000-0000-0000-000000000001',
    'shift-report-staff@test.invalid', 'staff', now()
  ),
  (
    '33000000-0000-0000-0000-000000000002',
    '23000000-0000-0000-0000-000000000001',
    '13000000-0000-0000-0000-000000000002',
    'shift-report-manager@test.invalid', 'manager', now()
  ),
  (
    '33000000-0000-0000-0000-000000000003',
    '23000000-0000-0000-0000-000000000002',
    '13000000-0000-0000-0000-000000000002',
    'shift-report-manager@test.invalid', 'manager', now()
  );

insert into public.restaurant_shifts (
  id, restaurant_id, shift_name, opening_cash_amount, opened_by_user_id
)
values
  (
    '83000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001',
    'UAE morning', 100, '13000000-0000-0000-0000-000000000001'
  ),
  (
    '83000000-0000-0000-0000-000000000002',
    '23000000-0000-0000-0000-000000000002',
    'India morning', 50, '13000000-0000-0000-0000-000000000002'
  );

insert into public.orders (
  id, restaurant_id, customer_name, customer_phone, payment_method, items,
  subtotal, delivery_fee, total, whatsapp_message, consent_order_processing,
  consent_timestamp, status, shift_id
)
values
  (
    '43000000-0000-0000-0000-000000000001',
    '23000000-0000-0000-0000-000000000001', 'Cash customer',
    '971500000051', 'Cash on Delivery', '[]'::jsonb, 25, 0, 25, 'test',
    true, now(), 'Completed', '83000000-0000-0000-0000-000000000001'
  ),
  (
    '43000000-0000-0000-0000-000000000002',
    '23000000-0000-0000-0000-000000000001', 'Card customer',
    '971500000052', 'Card on Delivery', '[]'::jsonb, 40, 0, 40, 'test',
    true, now(), 'Completed', '83000000-0000-0000-0000-000000000001'
  ),
  (
    '43000000-0000-0000-0000-000000000003',
    '23000000-0000-0000-0000-000000000002', 'UPI customer',
    '919800000051', 'UPI', '[]'::jsonb, 30, 0, 30, 'test',
    true, now(), 'Completed', '83000000-0000-0000-0000-000000000002'
  );

do $close_report_checks$
declare
  snapshot jsonb;
begin
  begin
    perform public.close_restaurant_shift_v2(
      '23000000-0000-0000-0000-000000000001',
      '83000000-0000-0000-0000-000000000001',
      125, 42, null,
      '[
        {"channel":"talabat","status":"entered","order_count":2,"gross_sales":50},
        {"channel":"noon","status":"zero","order_count":0,"gross_sales":0},
        {"channel":"deliveroo","status":"unavailable","note":"Portal offline"}
      ]'::jsonb,
      null,
      '13000000-0000-0000-0000-000000000001'
    );
    raise exception 'Shift closed without a note for a card difference';
  exception
    when others then
      if sqlerrm not like '%A closing note is required when reconciliation has a difference%' then
        raise;
      end if;
  end;

  perform public.close_restaurant_shift_v2(
    '23000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000001',
    125, 42, null,
    '[
      {"channel":"talabat","status":"entered","order_count":2,"gross_sales":50},
      {"channel":"noon","status":"zero","order_count":0,"gross_sales":0},
      {"channel":"deliveroo","status":"unavailable","note":"Portal offline"}
    ]'::jsonb,
    'Card terminal was two higher',
    '13000000-0000-0000-0000-000000000001'
  );

  select close_report_snapshot into snapshot
  from public.restaurant_shifts
  where id = '83000000-0000-0000-0000-000000000001';

  if snapshot->>'card_difference_amount' <> '2.00'
     or snapshot->>'marketplace_sales_total' <> '50.00'
     or snapshot->>'combined_operational_sales' <> '115.00' then
    raise exception 'Closed shift report totals are incorrect: %', snapshot;
  end if;

  if not exists (
    select 1 from public.shift_close_reports
    where shift_id = '83000000-0000-0000-0000-000000000001'
      and restaurant_id = '23000000-0000-0000-0000-000000000001'
      and version = 1
  ) then
    raise exception 'Immutable close report version 1 was not created';
  end if;
end;
$close_report_checks$;

do $cross_tenant_and_india_checks$
begin
  begin
    perform public.close_restaurant_shift_v2(
      '23000000-0000-0000-0000-000000000002',
      '83000000-0000-0000-0000-000000000002',
      50, 0, 30, '[]'::jsonb, null,
      '13000000-0000-0000-0000-000000000001'
    );
    raise exception 'Cross-tenant shift close unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%Only the shift opener or restaurant management can close this shift%' then
        raise;
      end if;
  end;

  perform public.close_restaurant_shift_v2(
    '23000000-0000-0000-0000-000000000002',
    '83000000-0000-0000-0000-000000000002',
    50, 0, 28, '[]'::jsonb, 'UPI report was short by two',
    '13000000-0000-0000-0000-000000000002'
  );

  if not exists (
    select 1 from public.restaurant_shifts
    where id = '83000000-0000-0000-0000-000000000002'
      and upi_difference_amount = -2
      and close_report_version = 1
  ) then
    raise exception 'India UPI reconciliation was not stored';
  end if;
end;
$cross_tenant_and_india_checks$;

do $correction_history_checks$
declare
  version_number integer;
begin
  begin
    perform public.revise_restaurant_shift_close_report(
      '23000000-0000-0000-0000-000000000001',
      '83000000-0000-0000-0000-000000000001',
      125, 40, null,
      '[
        {"channel":"talabat","status":"entered","order_count":2,"gross_sales":55},
        {"channel":"noon","status":"zero","order_count":0,"gross_sales":0},
        {"channel":"deliveroo","status":"unavailable","note":"Portal offline"}
      ]'::jsonb,
      'Cross-tenant correction attempt',
      '13000000-0000-0000-0000-000000000099'
    );
    raise exception 'Unknown actor report correction unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%Only restaurant management can correct a closed shift report%' then
        raise;
      end if;
  end;

  begin
    perform public.revise_restaurant_shift_close_report(
      '23000000-0000-0000-0000-000000000001',
      '83000000-0000-0000-0000-000000000001',
      125, 40, null,
      '[
        {"channel":"talabat","status":"entered","order_count":2,"gross_sales":55},
        {"channel":"noon","status":"zero","order_count":0,"gross_sales":0},
        {"channel":"deliveroo","status":"unavailable","note":"Portal offline"}
      ]'::jsonb,
      'Corrected platform export',
      '13000000-0000-0000-0000-000000000001'
    );
    raise exception 'Staff report correction unexpectedly succeeded';
  exception
    when others then
      if sqlerrm not like '%Only restaurant management can correct a closed shift report%' then
        raise;
      end if;
  end;

  version_number := public.revise_restaurant_shift_close_report(
    '23000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000001',
    125, 40, null,
    '[
      {"channel":"talabat","status":"entered","order_count":2,"gross_sales":55},
      {"channel":"noon","status":"zero","order_count":0,"gross_sales":0},
      {"channel":"deliveroo","status":"unavailable","note":"Portal offline"}
    ]'::jsonb,
    'Corrected platform export',
    '13000000-0000-0000-0000-000000000002'
  );

  if version_number <> 2 then
    raise exception 'Correction did not create version 2';
  end if;

  if (select count(*) from public.shift_close_reports
      where shift_id = '83000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Original report history was not preserved';
  end if;

  if not exists (
    select 1 from public.restaurant_shifts
    where id = '83000000-0000-0000-0000-000000000001'
      and close_report_version = 2
      and card_difference_amount = 0
      and marketplace_sales_total = 55
  ) then
    raise exception 'Corrected report totals were not applied';
  end if;
end;
$correction_history_checks$;

do $security_checks$
begin
  if has_table_privilege('anon', 'public.shift_close_reports', 'select')
     or has_table_privilege('authenticated', 'public.shift_close_reports', 'insert')
     or has_function_privilege(
       'authenticated',
       'public.close_restaurant_shift_v2(uuid,uuid,numeric,numeric,numeric,jsonb,text,uuid)',
       'execute'
     ) then
    raise exception 'Shift reports expose unsafe anon/authenticated privileges';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shift_close_reports'
      and cmd = 'SELECT'
      and qual like '%restaurant_id%'
  ) then
    raise exception 'Tenant-scoped shift report read policy is missing';
  end if;
end;
$security_checks$;

rollback;
