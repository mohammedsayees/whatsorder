-- Rollback-only checks: voiding a duplicate cash paid-out fixes expected cash
-- (live on an open shift, as a new report version after close, never after the
-- business day closes), and Finance links stay one-to-one and follow voids.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at) values
  ('16000000-0000-0000-0000-000000000001', 'void-staff@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('16000000-0000-0000-0000-000000000002', 'void-manager@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('16000000-0000-0000-0000-000000000003', 'void-other-staff@test.invalid', 'authenticated', 'authenticated', now(), now());

insert into public.restaurants (
  id, name, slug, whatsapp_number, status, is_active, country_code,
  currency_code, locale, time_zone, phone_country_code, shift_marketplace_channels,
  finance_enabled
) values (
  '26000000-0000-0000-0000-000000000001', 'Void Test', 'void-test',
  '971500000092', 'live', true, 'AE', 'AED', 'en-AE', 'Asia/Dubai', '971', '{}'::text[], true
);

insert into public.restaurant_users (id, restaurant_id, user_id, email, role, accepted_at) values
  ('36000000-0000-0000-0000-000000000001', '26000000-0000-0000-0000-000000000001',
   '16000000-0000-0000-0000-000000000001', 'void-staff@test.invalid', 'staff', now()),
  ('36000000-0000-0000-0000-000000000002', '26000000-0000-0000-0000-000000000001',
   '16000000-0000-0000-0000-000000000002', 'void-manager@test.invalid', 'manager', now()),
  ('36000000-0000-0000-0000-000000000003', '26000000-0000-0000-0000-000000000001',
   '16000000-0000-0000-0000-000000000003', 'void-other-staff@test.invalid', 'staff', now());

-- API-role privileges.
do $$
begin
  if has_function_privilege('authenticated', 'public.void_shift_cash_paid_out(uuid,uuid,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.void_shift_cash_paid_out(uuid,uuid,text,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.link_finance_paid_out_to_expense(uuid,uuid,uuid,boolean,text,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.get_finance_unbilled_paid_outs(uuid,integer)', 'execute')
     or not has_function_privilege('service_role', 'public.void_shift_cash_paid_out(uuid,uuid,text,uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.link_finance_paid_out_to_expense(uuid,uuid,uuid,boolean,text,uuid)', 'execute') then
    raise exception 'Paid-out void / finance link RPC privileges are wrong';
  end if;
  if exists (select 1 from pg_policies where tablename = 'finance_paid_out_links'
             and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')) then
    raise exception 'Browser write policy on finance_paid_out_links';
  end if;
end $$;

-- The Finance RPCs are called by the app as service_role.
set local role service_role;

do $$
declare
  r constant uuid := '26000000-0000-0000-0000-000000000001';
  staff constant uuid := '16000000-0000-0000-0000-000000000001';
  manager constant uuid := '16000000-0000-0000-0000-000000000002';
  other_staff constant uuid := '16000000-0000-0000-0000-000000000003';
  sid uuid;
  day_id uuid;
  first_id uuid;
  duplicate_id uuid;
  milk_id uuid;
  category uuid;
  expense_id uuid;
  milk_expense uuid;
  link_id uuid;
  report_version integer;
  summary jsonb;
  saved public.restaurant_shifts%rowtype;
  expense public.finance_expenses%rowtype;
begin
  sid := public.open_restaurant_shift_v2(r, 'Morning', 100, null, staff);
  select business_day_id into day_id from public.restaurant_shifts where id = sid;
  update public.restaurant_shifts set opened_at = now() - interval '1 hour' where id = sid;
  select id into category from public.finance_categories
  where restaurant_id = r and name = 'Ingredients & packaging';

  -- The same AED 50 bill entered twice.
  first_id := public.add_shift_cash_paid_out(r, sid, 50, 'Vegetables - Al Madina', staff);
  duplicate_id := public.add_shift_cash_paid_out(r, sid, 50, 'Vegetables - Al Madina', staff);
  summary := public.calculate_restaurant_shift_summary(r, sid);
  if (summary->>'expected_cash_amount')::numeric <> 0 or (summary->>'cash_paid_out_total')::numeric <> 100 then
    raise exception 'Baseline with duplicate is wrong: %', summary;
  end if;

  -- Another staff member can't void on someone else's open shift.
  begin
    perform public.void_shift_cash_paid_out(r, duplicate_id, 'dup', other_staff);
    raise exception 'Non-opener staff voided a paid-out';
  exception when others then
    if sqlerrm not like '%Only the shift opener or restaurant management can void a paid-out%' then raise; end if;
  end;
  begin
    perform public.void_shift_cash_paid_out(r, duplicate_id, '   ', staff);
    raise exception 'Void without a reason succeeded';
  exception when others then
    if sqlerrm not like '%A void reason is required%' then raise; end if;
  end;

  -- The opener voids the duplicate on the open shift: live totals, no report.
  report_version := public.void_shift_cash_paid_out(r, duplicate_id, 'Same bill entered twice', staff);
  if report_version is not null then raise exception 'Open-shift void returned a report version'; end if;
  summary := public.calculate_restaurant_shift_summary(r, sid);
  if (summary->>'expected_cash_amount')::numeric <> 50 or (summary->>'cash_paid_out_total')::numeric <> 50 then
    raise exception 'Void did not fix expected cash: %', summary;
  end if;
  if not exists (select 1 from public.shift_cash_paid_outs where id = duplicate_id
                 and voided_by_user_id = staff and void_reason = 'Same bill entered twice') then
    raise exception 'Voided row was not kept with its audit fields';
  end if;
  begin
    perform public.void_shift_cash_paid_out(r, duplicate_id, 'again', staff);
    raise exception 'Paid-out voided twice';
  exception when others then
    if sqlerrm not like '%already voided%' then raise; end if;
  end;

  -- Finance: voided paid-outs are not "without a bill" and can't be linked.
  if exists (select 1 from public.get_finance_unbilled_paid_outs(r, 50) where paid_out_id = duplicate_id)
     or not exists (select 1 from public.get_finance_unbilled_paid_outs(r, 50) where paid_out_id = first_id) then
    raise exception 'Unbilled list is wrong after void';
  end if;
  begin
    perform public.dismiss_finance_paid_out(r, duplicate_id, 'x', manager);
    raise exception 'Voided paid-out was dismissed';
  exception when others then
    if sqlerrm not like '%Paid-out not found%' then raise; end if;
  end;

  -- Link the real paid-out to a scanned bill of AED 52.50 (VAT): mismatch rules.
  insert into public.finance_expenses (
    restaurant_id, category_id, description, supplier_name, incurred_on,
    subtotal_fils, input_vat_fils, total_fils, status, payment_status, payment_method,
    created_by, updated_by
  ) values (
    r, category, 'Vegetables', 'Al Madina', current_date, 5000, 250, 5250, 'draft',
    'unpaid', 'bank_transfer', manager, manager
  ) returning id into expense_id;
  begin
    perform public.link_finance_paid_out_to_expense(r, first_id, expense_id, false, null, manager);
    raise exception 'Mismatched link without confirmation succeeded';
  exception when others then
    if sqlerrm not like '%Amounts differ%' then raise; end if;
  end;
  begin
    perform public.link_finance_paid_out_to_expense(r, first_id, expense_id, true, '  ', manager);
    raise exception 'Mismatched link without a reason succeeded';
  exception when others then
    if sqlerrm not like '%Amounts differ%' then raise; end if;
  end;
  link_id := public.link_finance_paid_out_to_expense(
    r, first_id, expense_id, true, 'Rest paid by card', manager);
  select * into expense from public.finance_expenses where id = expense_id;
  if expense.payment_method <> 'cash' or expense.payment_status <> 'partial'
     or expense.paid_on is null then
    raise exception 'Linked expense payment fields are wrong: %', row_to_json(expense);
  end if;
  if not exists (select 1 from public.finance_paid_out_links where id = link_id
                 and difference_fils = -250 and paid_out_amount_fils = 5000
                 and expense_total_fils = 5250 and mismatch_reason = 'Rest paid by card') then
    raise exception 'Link did not record the difference';
  end if;
  if not exists (select 1 from public.finance_audit_events
                 where entity_type = 'paid_out_link' and entity_id = link_id and actor_id = manager) then
    raise exception 'Link was not audited';
  end if;
  -- One paid-out = one bill, both ways.
  begin
    perform public.dismiss_finance_paid_out(r, first_id, 'x', manager);
    raise exception 'Linked paid-out dismissed';
  exception when others then
    if sqlerrm not like '%already linked or dismissed%' then raise; end if;
  end;

  -- A second (genuine) paid-out recorded as a cash expense, then the shift closes.
  milk_id := public.add_shift_cash_paid_out(r, sid, 20, 'Milk', staff);
  milk_expense := public.convert_finance_paid_out_to_expense(r, milk_id, category, null, null, manager);
  begin
    perform public.link_finance_paid_out_to_expense(r, first_id, milk_expense, false, null, manager);
    raise exception 'Expense linked to two paid-outs';
  exception when others then
    if sqlerrm not like '%already linked%' then raise; end if;
  end;
  -- Expected = 100 - 50 - 20 = 30.
  perform public.close_restaurant_shift_v3(r, sid, 30, 0, null, '[]'::jsonb, null, staff);
  select * into saved from public.restaurant_shifts where id = sid;
  if saved.expected_cash_amount <> 30 or saved.difference_amount <> 0
     or saved.close_report_version <> 1 then
    raise exception 'Close excluded/included the wrong paid-outs: %', row_to_json(saved);
  end if;

  -- After close: staff can't void; management can, as a new report version.
  begin
    perform public.void_shift_cash_paid_out(r, milk_id, 'mistake', staff);
    raise exception 'Staff voided after close';
  exception when others then
    if sqlerrm not like '%Only restaurant management can void a paid-out after shift close%' then raise; end if;
  end;
  report_version := public.void_shift_cash_paid_out(r, milk_id, 'Milk was paid by the owner, not the till', manager);
  select * into saved from public.restaurant_shifts where id = sid;
  if report_version <> 2 or saved.close_report_version <> 2 or saved.expected_cash_amount <> 50
     or saved.cash_paid_out_total <> 50 or saved.difference_amount <> -20
     or saved.cash_counted_amount <> 30
     or saved.close_report_snapshot->>'correction_reason' not like 'Cash paid-out voided:%' then
    raise exception 'Closed-shift void did not version the report: %', row_to_json(saved);
  end if;
  if (select (snapshot->>'expected_cash_amount')::numeric from public.shift_close_reports
      where shift_id = sid and version = 1) <> 30 then
    raise exception 'Original report version was changed';
  end if;
  -- Each version itemizes paid-outs as they were when it was written, voided
  -- ones included, and the shift row keeps the latest version exactly.
  if (select jsonb_array_length(snapshot->'paid_outs') from public.shift_close_reports
      where shift_id = sid and version = 1) <> 3
     or (select count(*) from public.shift_close_reports v,
           jsonb_array_elements(v.snapshot->'paid_outs') p
         where v.shift_id = sid and v.version = 1
           and (p->>'id')::uuid = milk_id and p->>'voided_at' is null) <> 1
     or (select count(*) from public.shift_close_reports v,
           jsonb_array_elements(v.snapshot->'paid_outs') p
         where v.shift_id = sid and v.version = 1
           and (p->>'id')::uuid = duplicate_id and p->>'void_reason' = 'Same bill entered twice') <> 1
     or (select count(*) from public.shift_close_reports v,
           jsonb_array_elements(v.snapshot->'paid_outs') p
         where v.shift_id = sid and v.version = 2
           and (p->>'id')::uuid = milk_id and p->>'void_reason' like 'Milk was paid by the owner%') <> 1
     or (select jsonb_typeof(snapshot->'other_income_entries') from public.shift_close_reports
         where shift_id = sid and version = 2) <> 'array'
     or saved.close_report_snapshot <> (select snapshot from public.shift_close_reports
                                         where shift_id = sid and version = 2) then
    raise exception 'Report versions do not itemize paid-outs as written';
  end if;
  -- The milk link is released; the expense itself is untouched.
  if exists (select 1 from public.finance_paid_out_links where paid_out_id = milk_id and removed_at is null)
     or not exists (select 1 from public.finance_paid_out_links where paid_out_id = milk_id
                    and removal_reason like 'Paid-out voided:%' and removed_by = manager)
     or (select status from public.finance_expenses where id = milk_expense) <> 'approved' then
    raise exception 'Void did not release the finance link correctly';
  end if;

  -- Voiding the linked expense puts its paid-out back in the queue.
  update public.finance_expenses set status = 'void', updated_by = manager where id = expense_id;
  if exists (select 1 from public.finance_paid_out_links where paid_out_id = first_id and removed_at is null)
     or not exists (select 1 from public.get_finance_unbilled_paid_outs(r, 50) where paid_out_id = first_id) then
    raise exception 'Voided expense did not release its paid-out';
  end if;
  -- ...and it can be dismissed, then undone.
  link_id := public.dismiss_finance_paid_out(r, first_id, 'Owner reimbursed', manager);
  if not public.unlink_finance_paid_out(r, link_id, 'Dismissed by mistake', manager) then
    raise exception 'Unlink failed';
  end if;

  -- A closed business day is final.
  perform public.close_business_day(r, day_id, manager);
  begin
    perform public.void_shift_cash_paid_out(r, first_id, 'too late', manager);
    raise exception 'Voided a paid-out in a closed business day';
  exception when others then
    if sqlerrm not like '%closed business day%' then raise; end if;
  end;
  if (select voided_at from public.shift_cash_paid_outs where id = first_id) is not null
     or (select close_report_version from public.restaurant_shifts where id = sid) <> 2 then
    raise exception 'Refused void left changes behind';
  end if;
end $$;

-- Finance linking is refused for tenants without Finance.
reset role;
update public.restaurants set finance_enabled = false where id = '26000000-0000-0000-0000-000000000001';
set local role service_role;
do $$
begin
  perform public.dismiss_finance_paid_out(
    '26000000-0000-0000-0000-000000000001',
    (select id from public.shift_cash_paid_outs where restaurant_id = '26000000-0000-0000-0000-000000000001'
       and voided_at is null limit 1),
    'x', '16000000-0000-0000-0000-000000000002');
  raise exception 'Linking worked with Finance disabled';
exception when others then
  if sqlerrm not like '%Finance is not enabled%' then raise; end if;
end $$;

rollback;
