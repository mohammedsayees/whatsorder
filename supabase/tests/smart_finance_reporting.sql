\set ON_ERROR_STOP on
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at) values
  ('1d000000-0000-0000-0000-000000000001', 'report-manager@test.invalid', 'authenticated', 'authenticated', now(), now());
insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active, finance_enabled) values
  ('2d000000-0000-0000-0000-000000000001', 'Report A', 'report-a', '971500000095', 'live', true, true),
  ('2d000000-0000-0000-0000-000000000002', 'Report B', 'report-b', '971500000096', 'live', true, true);
insert into public.restaurant_users (restaurant_id, user_id, email, role, accepted_at) values
  ('2d000000-0000-0000-0000-000000000001', '1d000000-0000-0000-0000-000000000001', 'report-manager@test.invalid', 'manager', now());

set local role service_role;
update public.finance_role_permissions set can_view = true, can_view_reports = true
where restaurant_id = '2d000000-0000-0000-0000-000000000001' and role = 'manager';
insert into public.menu_categories (id, restaurant_id, name) values
  ('3d000000-0000-0000-0000-000000000001', '2d000000-0000-0000-0000-000000000001', 'Report food');
insert into public.menu_items (id, restaurant_id, category_id, name, price) values
  ('4d000000-0000-0000-0000-000000000001', '2d000000-0000-0000-0000-000000000001', '3d000000-0000-0000-0000-000000000001', 'Uncosted tea', 10);
insert into public.orders (
  id, restaurant_id, customer_name, customer_phone, fulfilment_type, payment_method,
  items, subtotal, delivery_fee, total, status, whatsapp_message,
  consent_order_processing, consent_timestamp
) values (
  '5d000000-0000-0000-0000-000000000001', '2d000000-0000-0000-0000-000000000001',
  'Report test', '971500000097', 'takeaway', 'Cash on Delivery',
  '[{"item_id":"4d000000-0000-0000-0000-000000000001","name":"Uncosted tea","price":10,"quantity":1}]',
  10, 0, 10, 'Completed', 'test', true, now()
);
delete from public.finance_product_cost_snapshots where order_id = '5d000000-0000-0000-0000-000000000001';
do $backfill_checks$
declare result jsonb; business_today date;
begin
  -- The backfill range is in restaurant business dates (orders bucketed by
  -- restaurants.time_zone), not the session's current_date: they differ for
  -- part of every day (e.g. 20:00-24:00 UTC for Asia/Dubai).
  select (now() at time zone time_zone)::date into strict business_today
  from public.restaurants where id = '2d000000-0000-0000-0000-000000000001';
  result := public.backfill_finance_cost_snapshots(
    '2d000000-0000-0000-0000-000000000001', business_today, business_today, 10
  );
  if (result->>'snapshots_created')::integer <> 1 then raise exception 'Backfill did not create missing snapshot'; end if;
  if not exists (select 1 from public.finance_product_cost_snapshots
    where order_id = '5d000000-0000-0000-0000-000000000001' and completeness = 'missing_recipe') then
    raise exception 'Backfill hid missing recipe state';
  end if;
end;
$backfill_checks$;
insert into public.finance_report_runs (
  restaurant_id, period_start, period_end, order_count, coverage_bps, incomplete_line_count
) values
  ('2d000000-0000-0000-0000-000000000001', current_date, current_date, 1, 0, 1),
  ('2d000000-0000-0000-0000-000000000002', current_date, current_date, 0, 0, 0);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '1d000000-0000-0000-0000-000000000001', true);
do $report_rls_checks$
begin
  if (select count(*) from public.finance_report_runs) <> 1 then
    raise exception 'Report telemetry crossed tenant boundary';
  end if;
  begin
    insert into public.finance_report_runs (
      restaurant_id, period_start, period_end, order_count, coverage_bps, incomplete_line_count
    ) values ('2d000000-0000-0000-0000-000000000001', current_date, current_date, 0, 0, 0);
    raise exception 'Authenticated report write unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  if has_function_privilege('authenticated',
    'public.backfill_finance_cost_snapshots(uuid,date,date,integer)', 'execute') then
    raise exception 'Backfill exposed to authenticated role';
  end if;
end;
$report_rls_checks$;

rollback;
