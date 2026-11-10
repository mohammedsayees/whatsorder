\set ON_ERROR_STOP on

-- Rollback-only scanner queue, approval idempotency, duplicate, and RLS checks.
begin;

insert into auth.users (id, email, role, aud, created_at, updated_at)
values
  ('1e000000-0000-0000-0000-000000000001', 'scan-manager@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('1e000000-0000-0000-0000-000000000002', 'scan-owner@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('1e000000-0000-0000-0000-000000000003', 'scan-super@test.invalid', 'authenticated', 'authenticated', now(), now());

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active, finance_enabled)
values
  ('2e000000-0000-0000-0000-000000000001', 'Scanner A', 'scanner-a', '971500000071', 'live', true, true),
  ('2e000000-0000-0000-0000-000000000002', 'Scanner B', 'scanner-b', '971500000072', 'live', true, true);

insert into public.restaurant_users (restaurant_id, user_id, email, role, accepted_at)
values
  ('2e000000-0000-0000-0000-000000000001', '1e000000-0000-0000-0000-000000000001', 'scan-manager@test.invalid', 'manager', now()),
  ('2e000000-0000-0000-0000-000000000001', '1e000000-0000-0000-0000-000000000002', 'scan-owner@test.invalid', 'owner', now());
update public.profiles set role = 'super_admin'
where id = '1e000000-0000-0000-0000-000000000003';

set local role service_role;
insert into public.finance_categories (
  id, restaurant_id, name, classification, created_by, updated_by
) values
  ('3e000000-0000-0000-0000-000000000001', '2e000000-0000-0000-0000-000000000001', 'Scanner supplies', 'purchase', '1e000000-0000-0000-0000-000000000002', '1e000000-0000-0000-0000-000000000002'),
  ('3e000000-0000-0000-0000-000000000002', '2e000000-0000-0000-0000-000000000002', 'Other scanner supplies', 'purchase', null, null);

select public.create_finance_document_job(
  '2e000000-0000-0000-0000-000000000001',
  '4e000000-0000-0000-0000-000000000001',
  '2e000000-0000-0000-0000-000000000001/first.webp', 'first.webp',
  'image/webp', 1000, 1, repeat('a', 64),
  '1e000000-0000-0000-0000-000000000002'
);
select public.create_finance_document_job(
  '2e000000-0000-0000-0000-000000000001',
  '4e000000-0000-0000-0000-000000000002',
  '2e000000-0000-0000-0000-000000000001/duplicate.webp', 'duplicate.webp',
  'image/webp', 1000, 1, repeat('a', 64),
  '1e000000-0000-0000-0000-000000000002'
);
select public.create_finance_document_job(
  '2e000000-0000-0000-0000-000000000002',
  '4e000000-0000-0000-0000-000000000003',
  '2e000000-0000-0000-0000-000000000002/other.webp', 'other.webp',
  'image/webp', 1000, 1, repeat('b', 64), null
);

do $queue_checks$
declare claimed jsonb;
begin
  select public.claim_finance_extraction_job(
    '2e000000-0000-0000-0000-000000000001',
    '4e000000-0000-0000-0000-000000000001',
    '5e000000-0000-0000-0000-000000000001'
  ) into claimed;
  if claimed is null then raise exception 'Queued extraction job was not claimed'; end if;
  if public.claim_finance_extraction_job(
    '2e000000-0000-0000-0000-000000000001',
    '4e000000-0000-0000-0000-000000000001',
    '5e000000-0000-0000-0000-000000000002'
  ) is not null then raise exception 'Running job was claimed twice'; end if;
  if not public.complete_finance_extraction_job(
    '2e000000-0000-0000-0000-000000000001',
    '4e000000-0000-0000-0000-000000000001',
    '5e000000-0000-0000-0000-000000000001', 'test-v1', 'high',
    '{"supplier_name":"Tea Supplier","invoice_number":"INV-1","invoice_date":"2026-11-11","subtotal_fils":10000,"vat_fils":500,"total_fils":10500,"vat_inclusive":false,"confidence":"high","lines":[]}',
    '[]'
  ) then raise exception 'Claimed job could not be completed'; end if;
end;
$queue_checks$;

do $approval_checks$
declare first_id uuid; replay_id uuid;
begin
  first_id := public.approve_finance_document(
    '2e000000-0000-0000-0000-000000000001',
    '4e000000-0000-0000-0000-000000000001',
    '3e000000-0000-0000-0000-000000000001',
    'Tea Supplier', 'INV-1', '2026-11-11', 10000, 500, 10500, false,
    'unpaid', '', null, 'Tea supply bill',
    '[{"description":"Tea leaves","quantity":"2","unit":"kg","unit_price_fils":5000,"amount_fils":10000,"tax_fils":500,"classification":"purchase"}]',
    '1e000000-0000-0000-0000-000000000002'
  );
  replay_id := public.approve_finance_document(
    '2e000000-0000-0000-0000-000000000001',
    '4e000000-0000-0000-0000-000000000001',
    '3e000000-0000-0000-0000-000000000001',
    'Tea Supplier', 'INV-1', '2026-11-11', 10000, 500, 10500, false,
    'unpaid', '', null, 'Tea supply bill', '[]',
    '1e000000-0000-0000-0000-000000000002'
  );
  if first_id is distinct from replay_id then raise exception 'Approval replay was not idempotent'; end if;
  if (select count(*) from public.finance_expenses where source_document_id = '4e000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'Approval created duplicate expense rows';
  end if;
  if (select count(*) from public.finance_expense_lines where expense_id = first_id) <> 1 then
    raise exception 'Reviewed expense line was not stored';
  end if;
  if not exists (select 1 from public.finance_documents where id = '4e000000-0000-0000-0000-000000000001' and status = 'reviewed') then
    raise exception 'Approved document was not marked reviewed';
  end if;
end;
$approval_checks$;

do $duplicate_checks$
begin
  perform public.claim_finance_extraction_job(
    '2e000000-0000-0000-0000-000000000001',
    '4e000000-0000-0000-0000-000000000002',
    '5e000000-0000-0000-0000-000000000003'
  );
  perform public.complete_finance_extraction_job(
    '2e000000-0000-0000-0000-000000000001',
    '4e000000-0000-0000-0000-000000000002',
    '5e000000-0000-0000-0000-000000000003', 'test-v1', 'high',
    '{"total_fils":10500,"lines":[]}', '[]'
  );
  begin
    perform public.approve_finance_document(
      '2e000000-0000-0000-0000-000000000001',
      '4e000000-0000-0000-0000-000000000002',
      '3e000000-0000-0000-0000-000000000001',
      'Tea Supplier', 'INV-1-copy', '2026-11-11', 10000, 500, 10500, false,
      'unpaid', '', null, 'Duplicate bill', '[]',
      '1e000000-0000-0000-0000-000000000002'
    );
    raise exception 'Exact duplicate document unexpectedly posted';
  exception when others then
    if sqlerrm <> 'Duplicate document has already been posted' then raise; end if;
  end;
end;
$duplicate_checks$;

do $rate_limit_checks$
declare allowed boolean;
begin
  for attempt in 1..5 loop
    allowed := public.check_finance_scan_rate_limit(
      '2e000000-0000-0000-0000-000000000001',
      '1e000000-0000-0000-0000-000000000001'
    );
    if not allowed then raise exception 'Finance scan was limited too early'; end if;
  end loop;
  if public.check_finance_scan_rate_limit(
    '2e000000-0000-0000-0000-000000000001',
    '1e000000-0000-0000-0000-000000000001'
  ) then raise exception 'Finance scan burst limit did not activate'; end if;
end;
$rate_limit_checks$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-0000-0000-000000000001', true);
do $manager_rls$
begin
  if (select count(*) from public.finance_documents) <> 2 then
    raise exception 'Manager did not see exactly its tenant scanner documents';
  end if;
  if (select count(*) from public.finance_expense_lines) <> 1 then
    raise exception 'Manager did not see exactly its tenant expense line';
  end if;
  begin
    insert into public.finance_documents (
      restaurant_id, storage_path, original_name, mime_type, byte_size,
      page_count, file_hash, uploaded_by
    ) values (
      '2e000000-0000-0000-0000-000000000001', 'unauthorized', 'x.webp',
      'image/webp', 1, 1, repeat('c', 64), '1e000000-0000-0000-0000-000000000001'
    );
    raise exception 'Authenticated scanner insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$manager_rls$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '1e000000-0000-0000-0000-000000000003', true);
do $super_rls$
begin
  if (select count(*) from public.finance_documents) <> 0 then
    raise exception 'Super admin received implicit scanner document access';
  end if;
end;
$super_rls$;

reset role;
do $privilege_checks$
begin
  if has_function_privilege(
    'authenticated',
    'public.approve_finance_document(uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,boolean,text,text,date,text,jsonb,uuid)',
    'execute'
  ) then raise exception 'Authenticated role can execute scanner approval RPC'; end if;
  if not has_function_privilege(
    'service_role',
    'public.approve_finance_document(uuid,uuid,uuid,text,text,date,bigint,bigint,bigint,boolean,text,text,date,text,jsonb,uuid)',
    'execute'
  ) then raise exception 'Service role cannot execute scanner approval RPC'; end if;
end;
$privilege_checks$;

rollback;
