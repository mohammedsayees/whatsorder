-- Rollback-only checks: receipts attached to till paid-outs, and posting them.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at) values
  ('18000000-0000-0000-0000-000000000001', 'receipt-staff@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('18000000-0000-0000-0000-000000000002', 'receipt-manager@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('18000000-0000-0000-0000-000000000003', 'receipt-other@test.invalid', 'authenticated', 'authenticated', now(), now());

insert into public.restaurants (
  id, name, slug, whatsapp_number, status, is_active, country_code,
  currency_code, locale, time_zone, phone_country_code, shift_marketplace_channels,
  finance_enabled
) values (
  '28000000-0000-0000-0000-000000000001', 'Receipt Test', 'receipt-test',
  '971500000094', 'live', true, 'AE', 'AED', 'en-AE', 'Asia/Dubai', '971', '{}'::text[], true
);

insert into public.restaurant_users (id, restaurant_id, user_id, email, role, accepted_at) values
  ('38000000-0000-0000-0000-000000000001', '28000000-0000-0000-0000-000000000001',
   '18000000-0000-0000-0000-000000000001', 'receipt-staff@test.invalid', 'staff', now()),
  ('38000000-0000-0000-0000-000000000002', '28000000-0000-0000-0000-000000000001',
   '18000000-0000-0000-0000-000000000002', 'receipt-manager@test.invalid', 'manager', now()),
  ('38000000-0000-0000-0000-000000000003', '28000000-0000-0000-0000-000000000001',
   '18000000-0000-0000-0000-000000000003', 'receipt-other@test.invalid', 'staff', now());

do $$
begin
  if has_function_privilege('authenticated', 'public.create_paid_out_receipt_job(uuid,uuid,uuid,text,text,text,integer,integer,text,uuid)', 'execute')
     or has_function_privilege('anon', 'public.approve_finance_paid_out_receipt(uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,boolean,text,jsonb,boolean,text,uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.create_paid_out_receipt_job(uuid,uuid,uuid,text,text,text,integer,integer,text,uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.approve_finance_paid_out_receipt(uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,boolean,text,jsonb,boolean,text,uuid)', 'execute') then
    raise exception 'Receipt RPC privileges are wrong';
  end if;
end $$;

set local role service_role;

create function pg_temp.attach(paid_out uuid, doc uuid, actor uuid, hash_char text)
returns uuid language sql as $$
  select public.create_paid_out_receipt_job(
    '28000000-0000-0000-0000-000000000001', paid_out, doc,
    '28000000-0000-0000-0000-000000000001/' || doc::text || '.webp', 'receipt.jpg',
    'image/webp', 1000, 1, repeat(hash_char, 64), actor);
$$;

do $$
declare
  r constant uuid := '28000000-0000-0000-0000-000000000001';
  staff constant uuid := '18000000-0000-0000-0000-000000000001';
  manager constant uuid := '18000000-0000-0000-0000-000000000002';
  other_staff constant uuid := '18000000-0000-0000-0000-000000000003';
  doc1 constant uuid := '48000000-0000-0000-0000-000000000001';
  doc2 constant uuid := '48000000-0000-0000-0000-000000000002';
  doc3 constant uuid := '48000000-0000-0000-0000-000000000003';
  plain_doc constant uuid := '48000000-0000-0000-0000-000000000009';
  sid uuid;
  veg uuid;
  milk uuid;
  category uuid;
  receipt_expense uuid;
  expense public.finance_expenses%rowtype;
  lines jsonb := '[{"description":"Vegetables","amount_fils":5000,"tax_fils":250,"classification":"purchase"}]';
begin
  sid := public.open_restaurant_shift_v2(r, 'Morning', 200, null, staff);
  update public.restaurant_shifts set opened_at = now() - interval '1 hour' where id = sid;
  select id into category from public.finance_categories where restaurant_id = r and name = 'Ingredients & packaging';
  veg := public.add_shift_cash_paid_out(r, sid, 50, 'Vegetables', staff);

  -- Only the opener or management may attach.
  begin
    perform pg_temp.attach(veg, doc1, other_staff, 'a');
    raise exception 'Non-opener staff attached a receipt';
  exception when others then
    if sqlerrm not like '%Only the shift opener or restaurant management can attach a receipt%' then raise; end if;
  end;

  -- The opener attaches: a queued Finance document tied to the paid-out.
  perform pg_temp.attach(veg, doc1, staff, 'a');
  if not exists (select 1 from public.finance_documents where id = doc1 and shift_paid_out_id = veg
                 and status = 'queued' and uploaded_by = staff)
     or not exists (select 1 from public.finance_extraction_jobs where document_id = doc1) then
    raise exception 'Receipt document or job missing';
  end if;
  begin
    perform pg_temp.attach(veg, doc2, manager, 'b');
    raise exception 'Two receipts on one paid-out';
  exception when others then
    if sqlerrm not like '%already attached%' then raise; end if;
  end;

  -- Simulate the read, then post it. Bill AED 52.50 vs AED 50 paid out.
  update public.finance_documents set status = 'extracted' where id = doc1;
  begin
    perform public.approve_finance_paid_out_receipt(
      r, doc1, category, 'Al Madina', 'INV-1', current_date, 5000, 250, 5250, false,
      'Vegetables', lines, false, null, manager);
    raise exception 'Mismatched receipt posted without confirmation';
  exception when others then
    if sqlerrm not like '%Amounts differ%' then raise; end if;
  end;
  if exists (select 1 from public.finance_expenses where source_document_id = doc1)
     or (select status from public.finance_documents where id = doc1) <> 'extracted' then
    raise exception 'Refused receipt post left changes behind';
  end if;
  receipt_expense := public.approve_finance_paid_out_receipt(
    r, doc1, category, 'Al Madina', 'INV-1', current_date, 5000, 250, 5250, false,
    'Vegetables', lines, true, 'AED 2.50 paid by card', manager);
  select * into expense from public.finance_expenses where id = receipt_expense;
  if expense.source <> 'scan' or expense.payment_method <> 'cash' or expense.payment_status <> 'partial'
     or (select status from public.finance_documents where id = doc1) <> 'reviewed'
     or not exists (select 1 from public.finance_paid_out_links where paid_out_id = veg
                    and expense_id = receipt_expense and removed_at is null
                    and difference_fils = -250 and mismatch_reason = 'AED 2.50 paid by card') then
    raise exception 'Receipt post did not link correctly: %', row_to_json(expense);
  end if;
  begin
    perform public.approve_finance_paid_out_receipt(
      r, doc1, category, 'Al Madina', 'INV-1', current_date, 5000, 250, 5250, false,
      'Vegetables', lines, true, 'again', manager);
    raise exception 'Receipt posted twice';
  exception when others then
    if sqlerrm not like '%already been posted%' then raise; end if;
  end;
  -- A paid-out that already has a bill can't take a receipt.
  begin
    perform pg_temp.attach(veg, doc2, manager, 'b');
    raise exception 'Receipt attached to a billed paid-out';
  exception when others then
    if sqlerrm not like '%already has a bill%' then raise; end if;
  end;

  -- A receipt whose paid-out is then voided can't be posted against it.
  milk := public.add_shift_cash_paid_out(r, sid, 20, 'Milk', staff);
  perform pg_temp.attach(milk, doc2, staff, 'b');
  perform public.void_shift_cash_paid_out(r, milk, 'Entered by mistake', staff);
  update public.finance_documents set status = 'extracted' where id = doc2;
  begin
    perform public.approve_finance_paid_out_receipt(
      r, doc2, category, null, null, current_date, 2000, 0, 2000, false, 'Milk', '[]'::jsonb,
      false, null, manager);
    raise exception 'Receipt posted against a voided paid-out';
  exception when others then
    if sqlerrm not like '%Paid-out not found%' then raise; end if;
  end;
  if exists (select 1 from public.finance_expenses where source_document_id = doc2)
     or (select status from public.finance_documents where id = doc2) <> 'extracted' then
    raise exception 'Voided paid-out refusal left changes behind';
  end if;
  -- ...and a voided paid-out can't take a receipt either.
  begin
    perform pg_temp.attach(milk, doc3, staff, 'c');
    raise exception 'Receipt attached to a voided paid-out';
  exception when others then
    if sqlerrm not like '%not found or voided%' then raise; end if;
  end;

  -- An ordinary bill isn't posted through the receipt path.
  perform public.create_finance_document_job(
    r, plain_doc, r::text || '/plain.pdf', 'plain.pdf', 'application/pdf', 1000, 1, repeat('d', 64), manager);
  begin
    perform public.approve_finance_paid_out_receipt(
      r, plain_doc, category, null, null, current_date, 1000, 0, 1000, false, 'X', '[]'::jsonb,
      false, null, manager);
    raise exception 'Plain bill posted as a receipt';
  exception when others then
    if sqlerrm not like '%not a paid-out receipt%' then raise; end if;
  end;

  -- After close, receipts can't be attached.
  milk := public.add_shift_cash_paid_out(r, sid, 15, 'Bread', staff);
  perform public.close_restaurant_shift_v3(r, sid, 0, 0, null, '[]'::jsonb, 'test close', staff);
  begin
    perform pg_temp.attach(milk, doc3, manager, 'c');
    raise exception 'Receipt attached after close';
  exception when others then
    if sqlerrm not like '%only while the shift is open%' then raise; end if;
  end;
end $$;

-- Finance disabled: refused.
reset role;
update public.restaurants set finance_enabled = false where id = '28000000-0000-0000-0000-000000000001';
set local role service_role;
do $$
declare
  sid uuid;
  paid_out uuid;
begin
  sid := public.open_restaurant_shift_v2('28000000-0000-0000-0000-000000000001', 'Evening', 50, null,
    '18000000-0000-0000-0000-000000000002');
  paid_out := public.add_shift_cash_paid_out('28000000-0000-0000-0000-000000000001', sid, 10, 'Ice',
    '18000000-0000-0000-0000-000000000002');
  perform pg_temp.attach(paid_out, '48000000-0000-0000-0000-000000000004',
    '18000000-0000-0000-0000-000000000002', 'e');
  raise exception 'Receipt attached with Finance disabled';
exception when others then
  if sqlerrm not like '%not available for this restaurant%' then raise; end if;
end $$;

rollback;
