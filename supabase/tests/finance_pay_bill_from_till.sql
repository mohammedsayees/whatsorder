-- Rollback-only checks: posting a cash bill straight to the open shift creates
-- the approved expense, the paid-out and the link together, or nothing at all.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at) values
  ('17000000-0000-0000-0000-000000000001', 'till-staff@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('17000000-0000-0000-0000-000000000002', 'till-manager@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('17000000-0000-0000-0000-000000000003', 'till-other-staff@test.invalid', 'authenticated', 'authenticated', now(), now());

insert into public.restaurants (
  id, name, slug, whatsapp_number, status, is_active, country_code,
  currency_code, locale, time_zone, phone_country_code, shift_marketplace_channels,
  finance_enabled
) values (
  '27000000-0000-0000-0000-000000000001', 'Till Test', 'till-test',
  '971500000093', 'live', true, 'AE', 'AED', 'en-AE', 'Asia/Dubai', '971', '{}'::text[], true
);

insert into public.restaurant_users (id, restaurant_id, user_id, email, role, accepted_at) values
  ('37000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001',
   '17000000-0000-0000-0000-000000000001', 'till-staff@test.invalid', 'staff', now()),
  ('37000000-0000-0000-0000-000000000002', '27000000-0000-0000-0000-000000000001',
   '17000000-0000-0000-0000-000000000002', 'till-manager@test.invalid', 'manager', now()),
  ('37000000-0000-0000-0000-000000000003', '27000000-0000-0000-0000-000000000001',
   '17000000-0000-0000-0000-000000000003', 'till-other-staff@test.invalid', 'staff', now());

insert into public.finance_documents (
  id, restaurant_id, storage_path, original_name, mime_type, byte_size, file_hash, status
) values (
  '47000000-0000-0000-0000-000000000001', '27000000-0000-0000-0000-000000000001',
  '27000000-0000-0000-0000-000000000001/bill.pdf', 'bill.pdf', 'application/pdf', 1000,
  repeat('a', 64), 'extracted'
);

do $$
begin
  if has_function_privilege('authenticated', 'public.create_finance_expense_from_till(uuid,uuid,text,text,date,bigint,bigint,bigint,boolean,date,date,uuid,uuid,boolean,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.approve_finance_document_from_till(uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,boolean,text,jsonb,uuid,boolean,uuid)', 'execute')
     or has_function_privilege('anon', 'public.finance_pay_expense_from_till(uuid,uuid,uuid,boolean,uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.create_finance_expense_from_till(uuid,uuid,text,text,date,bigint,bigint,bigint,boolean,date,date,uuid,uuid,boolean,uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.approve_finance_document_from_till(uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,boolean,text,jsonb,uuid,boolean,uuid)', 'execute') then
    raise exception 'Pay-from-till RPC privileges are wrong';
  end if;
end $$;

set local role service_role;

do $$
declare
  r constant uuid := '27000000-0000-0000-0000-000000000001';
  staff constant uuid := '17000000-0000-0000-0000-000000000001';
  manager constant uuid := '17000000-0000-0000-0000-000000000002';
  other_staff constant uuid := '17000000-0000-0000-0000-000000000003';
  doc constant uuid := '47000000-0000-0000-0000-000000000001';
  sid uuid;
  category uuid;
  till_expense uuid;
  expense public.finance_expenses%rowtype;
  paid_out public.shift_cash_paid_outs%rowtype;
  expenses_before integer;
  paid_outs_before integer;
  summary jsonb;
begin
  sid := public.open_restaurant_shift_v2(r, 'Morning', 200, null, staff);
  update public.restaurant_shifts set opened_at = now() - interval '1 hour' where id = sid;
  select id into category from public.finance_categories
  where restaurant_id = r and name = 'Ingredients & packaging';

  -- Manual bill AED 52.50 (50 + 2.50 VAT) paid from the till by a manager.
  till_expense := public.create_finance_expense_from_till(
    r, category, 'Vegetables', 'Al Madina', current_date, 5000, 250, 5250, false,
    null, null, null, sid, false, manager);
  select * into expense from public.finance_expenses where id = till_expense;
  select p.* into paid_out from public.shift_cash_paid_outs p
  join public.finance_paid_out_links l on l.paid_out_id = p.id and l.removed_at is null
  where l.expense_id = till_expense;
  if expense.status <> 'approved' or expense.payment_method <> 'cash' or expense.payment_status <> 'paid'
     or expense.paid_on is null or expense.approved_by <> manager then
    raise exception 'Till expense fields are wrong: %', row_to_json(expense);
  end if;
  if paid_out.id is null or paid_out.amount <> 52.50 or paid_out.shift_id <> sid
     or paid_out.reason <> 'Bill: Al Madina' or paid_out.recorded_by_user_id <> manager then
    raise exception 'Till paid-out is wrong: %', row_to_json(paid_out);
  end if;
  summary := public.calculate_restaurant_shift_summary(r, sid);
  if (summary->>'expected_cash_amount')::numeric <> 147.50 then
    raise exception 'Expected cash not updated: %', summary;
  end if;

  -- A same-amount paid-out without a bill is already on the shift.
  perform public.add_shift_cash_paid_out(r, sid, 30, 'Eggs', staff);
  select count(*) into expenses_before from public.finance_expenses where restaurant_id = r;
  select count(*) into paid_outs_before from public.shift_cash_paid_outs where restaurant_id = r;
  begin
    perform public.create_finance_expense_from_till(
      r, category, 'Eggs', null, current_date, 3000, 0, 3000, false, null, null, null, sid, false, manager);
    raise exception 'Same-amount guard did not fire';
  exception when others then
    if sqlerrm not like '%same amount without a bill%' then raise; end if;
  end;
  if (select count(*) from public.finance_expenses where restaurant_id = r) <> expenses_before
     or (select count(*) from public.shift_cash_paid_outs where restaurant_id = r) <> paid_outs_before then
    raise exception 'Refused till payment left a partial record';
  end if;
  -- Explicitly a different payment: allowed.
  perform public.create_finance_expense_from_till(
    r, category, 'Bread', 'Bakery', current_date, 3000, 0, 3000, false, null, null, null, sid, true, manager);

  -- Staff who didn't open the shift can't take cash from it; nothing is saved.
  select count(*) into expenses_before from public.finance_expenses where restaurant_id = r;
  begin
    perform public.create_finance_expense_from_till(
      r, category, 'Milk', null, current_date, 1500, 0, 1500, false, null, null, null, sid, false, other_staff);
    raise exception 'Non-opener staff paid from the till';
  exception when others then
    if sqlerrm not like '%Only the shift opener or restaurant management can add a paid-out%' then raise; end if;
  end;
  if (select count(*) from public.finance_expenses where restaurant_id = r) <> expenses_before then
    raise exception 'Refused till payment left an expense behind';
  end if;

  -- Scanned bill approved and paid from the till.
  till_expense := public.approve_finance_document_from_till(
    r, doc, category, 'Fresh Co', 'INV-9', current_date, 2000, 100, 2100, false,
    'Bill from Fresh Co', '[{"description":"Tomatoes","amount_fils":2000,"tax_fils":100,"classification":"purchase"}]'::jsonb,
    sid, false, manager);
  select * into expense from public.finance_expenses where id = till_expense;
  if expense.source <> 'scan' or expense.source_document_id <> doc or expense.payment_method <> 'cash'
     or expense.payment_status <> 'paid' or expense.invoice_number <> 'INV-9' then
    raise exception 'Scanned till expense is wrong: %', row_to_json(expense);
  end if;
  if not exists (select 1 from public.shift_cash_paid_outs p
                 join public.finance_paid_out_links l on l.paid_out_id = p.id and l.removed_at is null
                 where l.expense_id = till_expense and p.amount = 21 and p.reason = 'Bill: Fresh Co · #INV-9')
     or (select status from public.finance_documents where id = doc) <> 'reviewed'
     or (select count(*) from public.finance_expense_lines line where line.expense_id = till_expense) <> 1 then
    raise exception 'Scanned till paid-out, link or document state is wrong';
  end if;
  begin
    perform public.approve_finance_document_from_till(
      r, doc, category, 'Fresh Co', 'INV-9', current_date, 2000, 100, 2100, false,
      'Bill from Fresh Co', '[]'::jsonb, sid, false, manager);
    raise exception 'Posted bill paid from the till twice';
  exception when others then
    if sqlerrm not like '%already been posted%' then raise; end if;
  end;

  -- After close, the till option is refused with nothing saved.
  perform public.close_restaurant_shift_v3(r, sid, 0, 0, null, '[]'::jsonb, 'test close', staff);
  select count(*) into expenses_before from public.finance_expenses where restaurant_id = r;
  begin
    perform public.create_finance_expense_from_till(
      r, category, 'Late', null, current_date, 1000, 0, 1000, false, null, null, null, sid, false, manager);
    raise exception 'Paid from a closed shift';
  exception when others then
    if sqlerrm not like '%no longer open%' then raise; end if;
  end;
  if (select count(*) from public.finance_expenses where restaurant_id = r) <> expenses_before then
    raise exception 'Closed-shift refusal left an expense behind';
  end if;
end $$;

-- Finance disabled: refused, nothing saved.
reset role;
update public.restaurants set finance_enabled = false where id = '27000000-0000-0000-0000-000000000001';
set local role service_role;
do $$
declare
  r constant uuid := '27000000-0000-0000-0000-000000000001';
  sid uuid;
  before_count integer;
begin
  sid := public.open_restaurant_shift_v2(r, 'Evening', 100, null, '17000000-0000-0000-0000-000000000002');
  select count(*) into before_count from public.shift_cash_paid_outs where restaurant_id = r;
  begin
    perform public.create_finance_expense_from_till(
      r, (select id from public.finance_categories where restaurant_id = r limit 1),
      'X', null, current_date, 1000, 0, 1000, false, null, null, null, sid, false,
      '17000000-0000-0000-0000-000000000002');
    raise exception 'Paid from till with Finance disabled';
  exception when others then
    if sqlerrm not like '%Finance is not enabled%' then raise; end if;
  end;
  if (select count(*) from public.shift_cash_paid_outs where restaurant_id = r) <> before_count then
    raise exception 'Finance-disabled refusal left a paid-out behind';
  end if;
end $$;

rollback;
