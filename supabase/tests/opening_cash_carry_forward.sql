-- Rollback-only: opening cash carries forward from the last count.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at)
values ('19200000-0000-0000-0000-000000000001', 'opening-cash@test.invalid',
  'authenticated', 'authenticated', now(), now());
insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active)
values ('29200000-0000-0000-0000-000000000001', 'Opening cash test',
  'opening-cash-test', '971500000291', 'live', true),
  ('29200000-0000-0000-0000-000000000002', 'Other tenant',
  'opening-cash-other', '971500000292', 'live', true);
insert into public.restaurant_users (restaurant_id, user_id, email, role, accepted_at)
values ('29200000-0000-0000-0000-000000000001',
  '19200000-0000-0000-0000-000000000001', 'opening-cash@test.invalid', 'manager', now()),
  ('29200000-0000-0000-0000-000000000002',
  '19200000-0000-0000-0000-000000000001', 'opening-cash@test.invalid', 'manager', now());

do $opening_cash$
declare
  r constant uuid := '29200000-0000-0000-0000-000000000001';
  manager constant uuid := '19200000-0000-0000-0000-000000000001';
  other_shift uuid;
  first_shift uuid;
  second_shift uuid;
  third_shift uuid;
  saved public.restaurant_shifts%rowtype;
  report jsonb;
begin
  -- Another tenant's count must never be used as this restaurant's last count.
  other_shift := public.open_restaurant_shift_v3(
    '29200000-0000-0000-0000-000000000002', 'Other', 0, null, null, manager);
  perform public.close_restaurant_shift_v4(
    '29200000-0000-0000-0000-000000000002', other_shift, 999, 0, null, '[]'::jsonb, 'Other tenant', manager);

  -- First shift: nothing to compare with, no reason needed.
  first_shift := public.open_restaurant_shift_v3(r, 'First', 50, null, null, manager);
  select * into saved from public.restaurant_shifts where id = first_shift;
  if saved.previous_cash_counted_amount is not null or saved.opening_cash_reason is not null then
    raise exception 'First shift recorded a previous count: %', row_to_json(saved);
  end if;
  perform public.close_restaurant_shift_v4(r, first_shift, 80, 0, null, '[]'::jsonb, 'Recount', manager);

  -- Matching the last count needs no reason; a stray reason is dropped.
  second_shift := public.open_restaurant_shift_v3(r, 'Second', 80, null, 'not needed', manager);
  select * into saved from public.restaurant_shifts where id = second_shift;
  if saved.previous_cash_counted_amount <> 80 or saved.opening_cash_reason is not null then
    raise exception 'Matching opening cash was stored wrongly: %', row_to_json(saved);
  end if;
  perform public.close_restaurant_shift_v4(r, second_shift, 30.75, 0, null, '[]'::jsonb, 'Paid-outs not recorded', manager);

  -- A typo (30.75 entered as 3075) is refused without a reason, leaving no shift.
  begin
    perform public.open_restaurant_shift_v3(r, 'Typo', 3075, null, null, manager);
    raise exception 'Opened with a different opening cash and no reason';
  exception when others then
    if sqlerrm not like '%Explain why opening cash differs%' then raise; end if;
  end;
  begin
    perform public.open_restaurant_shift_v3(r, 'Typo', 3075, null, '  ', manager);
    raise exception 'Opened with a blank reason';
  exception when others then
    if sqlerrm not like '%Explain why opening cash differs%' then raise; end if;
  end;
  if exists (select 1 from public.restaurant_shifts where restaurant_id = r and status = 'open') then
    raise exception 'A refused open left a shift behind';
  end if;

  -- A real difference with a reason is stored and reaches the report.
  third_shift := public.open_restaurant_shift_v3(r, 'Third', 10.75, null, 'Owner took AED 20 for the bank', manager);
  select * into saved from public.restaurant_shifts where id = third_shift;
  if saved.previous_cash_counted_amount <> 30.75 or saved.opening_cash_amount <> 10.75
     or saved.opening_cash_reason <> 'Owner took AED 20 for the bank' then
    raise exception 'Opening difference was stored wrongly: %', row_to_json(saved);
  end if;
  perform public.close_restaurant_shift_v4(r, third_shift, 10.75, 0, null, '[]'::jsonb, null, manager);
  select snapshot into report from public.shift_close_reports where shift_id = third_shift and version = 1;
  if (report->'opening_check'->>'previous_cash_counted_amount')::numeric <> 30.75
     or (report->'opening_check'->>'opening_cash_amount')::numeric <> 10.75
     or (report->'opening_check'->>'difference')::numeric <> -20
     or report->'opening_check'->>'reason' <> 'Owner took AED 20 for the bank' then
    raise exception 'Report opening check is wrong: %', report->'opening_check';
  end if;
  if (select close_report_snapshot from public.restaurant_shifts where id = third_shift) <> report then
    raise exception 'Shift row snapshot differs from its report';
  end if;

  if has_function_privilege('authenticated', 'public.open_restaurant_shift_v3(uuid,text,numeric,text,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.open_restaurant_shift_v3(uuid,text,numeric,text,text,uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.open_restaurant_shift_v3(uuid,text,numeric,text,text,uuid)', 'execute') then
    raise exception 'open_restaurant_shift_v3 privileges are wrong';
  end if;
end;
$opening_cash$;

rollback;
