-- Smart Finance milestone 2: private bill documents, durable extraction jobs,
-- reviewed line items, duplicate controls, and idempotent approval.

create table public.finance_documents (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 180),
  mime_type text not null check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  byte_size integer not null check (byte_size between 1 and 10485760),
  page_count integer not null default 1 check (page_count between 1 and 10),
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued' check (
    status in ('queued', 'processing', 'extracted', 'failed', 'reviewed', 'deleted')
  ),
  duplicate_of_document_id uuid,
  extraction_version text,
  confidence text check (confidence is null or confidence in ('high', 'medium', 'low')),
  extracted_json jsonb,
  extraction_warnings jsonb not null default '[]'::jsonb
    check (jsonb_typeof(extraction_warnings) = 'array'),
  error_code text,
  uploaded_by uuid references auth.users(id) on delete set null,
  retention_until date not null default (current_date + 2557),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_documents_id_restaurant_unique unique (id, restaurant_id),
  constraint finance_documents_duplicate_tenant_fk
    foreign key (duplicate_of_document_id, restaurant_id)
    references public.finance_documents(id, restaurant_id)
);

create table public.finance_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  document_id uuid not null,
  status text not null default 'queued' check (
    status in ('queued', 'running', 'succeeded', 'failed')
  ),
  attempts integer not null default 0 check (attempts between 0 and 3),
  lease_token uuid,
  locked_at timestamptz,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_extraction_jobs_document_unique unique (document_id),
  constraint finance_extraction_jobs_document_tenant_fk
    foreign key (document_id, restaurant_id)
    references public.finance_documents(id, restaurant_id) on delete cascade
);

create table public.finance_expense_lines (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  expense_id uuid not null,
  line_number integer not null check (line_number between 1 and 100),
  description text not null check (char_length(trim(description)) between 1 and 240),
  quantity numeric(14, 4) check (quantity is null or quantity > 0),
  unit text check (unit is null or char_length(trim(unit)) between 1 and 40),
  unit_price_fils bigint check (unit_price_fils is null or unit_price_fils >= 0),
  amount_fils bigint not null check (amount_fils >= 0),
  tax_fils bigint not null default 0 check (tax_fils >= 0),
  classification text not null default 'expense' check (
    classification in ('expense', 'purchase', 'fee', 'discount', 'other')
  ),
  created_at timestamptz not null default now(),
  constraint finance_expense_lines_expense_line_unique unique (expense_id, line_number),
  constraint finance_expense_lines_expense_tenant_fk
    foreign key (expense_id, restaurant_id)
    references public.finance_expenses(id, restaurant_id) on delete cascade
);

create table public.finance_scan_attempts (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.finance_expenses
  drop constraint if exists finance_expenses_source_check;
alter table public.finance_expenses
  add constraint finance_expenses_source_check check (source in ('manual', 'scan'));
alter table public.finance_expenses
  add column source_document_id uuid,
  add column invoice_number text check (
    invoice_number is null or char_length(trim(invoice_number)) between 1 and 100
  );
alter table public.finance_expenses
  add constraint finance_expenses_source_document_tenant_fk
    foreign key (source_document_id, restaurant_id)
    references public.finance_documents(id, restaurant_id);
alter table public.finance_expenses
  add constraint finance_expenses_source_document_unique unique (source_document_id);
alter table public.finance_expenses
  add constraint finance_expenses_scan_source_valid check (
    (source = 'scan' and source_document_id is not null)
    or (source = 'manual' and source_document_id is null)
  );

create index finance_documents_restaurant_created
  on public.finance_documents(restaurant_id, created_at desc);
create index finance_documents_restaurant_hash
  on public.finance_documents(restaurant_id, file_hash, created_at desc)
  where status <> 'deleted';
create index finance_documents_invoice_lookup
  on public.finance_expenses(restaurant_id, lower(supplier_name), lower(invoice_number))
  where status <> 'void' and invoice_number is not null;
create index finance_extraction_jobs_status
  on public.finance_extraction_jobs(status, created_at)
  where status in ('queued', 'running', 'failed');
create index finance_expense_lines_expense
  on public.finance_expense_lines(restaurant_id, expense_id, line_number);
create index finance_scan_attempts_limit
  on public.finance_scan_attempts(restaurant_id, user_id, created_at desc);

create trigger finance_documents_set_updated_at
before update on public.finance_documents
for each row execute function public.set_updated_at();
create trigger finance_extraction_jobs_set_updated_at
before update on public.finance_extraction_jobs
for each row execute function public.set_updated_at();

create or replace function public.check_finance_scan_rate_limit(
  target_restaurant_id uuid,
  target_user_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $check_finance_scan_rate_limit$
declare
  recent_count integer;
  daily_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    target_restaurant_id::text || ':' || target_user_id::text || ':finance-scan', 0
  ));
  delete from public.finance_scan_attempts where created_at < now() - interval '2 days';
  select count(*) into recent_count
  from public.finance_scan_attempts
  where restaurant_id = target_restaurant_id and user_id = target_user_id
    and created_at >= now() - interval '10 minutes';
  select count(*) into daily_count
  from public.finance_scan_attempts
  where restaurant_id = target_restaurant_id and user_id = target_user_id
    and created_at >= now() - interval '1 day';
  if recent_count >= 5 or daily_count >= 30 then return false; end if;
  insert into public.finance_scan_attempts (restaurant_id, user_id)
  values (target_restaurant_id, target_user_id);
  return true;
end;
$check_finance_scan_rate_limit$;

create or replace function public.create_finance_document_job(
  target_restaurant_id uuid,
  requested_document_id uuid,
  requested_storage_path text,
  requested_original_name text,
  requested_mime_type text,
  requested_byte_size integer,
  requested_page_count integer,
  requested_file_hash text,
  event_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $create_finance_document_job$
declare duplicate_id uuid;
begin
  if not exists (
    select 1 from public.restaurants
    where id = target_restaurant_id and finance_enabled
  ) then raise exception 'Finance is not enabled'; end if;
  select id into duplicate_id from public.finance_documents
  where restaurant_id = target_restaurant_id
    and file_hash = requested_file_hash and status <> 'deleted'
  order by created_at desc limit 1;
  insert into public.finance_documents (
    id, restaurant_id, storage_path, original_name, mime_type, byte_size,
    page_count, file_hash, duplicate_of_document_id, uploaded_by
  ) values (
    requested_document_id, target_restaurant_id, requested_storage_path,
    requested_original_name, requested_mime_type, requested_byte_size,
    requested_page_count, requested_file_hash, duplicate_id, event_actor_user_id
  );
  insert into public.finance_extraction_jobs (restaurant_id, document_id)
  values (target_restaurant_id, requested_document_id);
  return jsonb_build_object('document_id', requested_document_id, 'duplicate_of', duplicate_id);
end;
$create_finance_document_job$;

create or replace function public.claim_finance_extraction_job(
  target_restaurant_id uuid,
  target_document_id uuid,
  requested_lease_token uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $claim_finance_extraction_job$
declare claimed public.finance_extraction_jobs;
begin
  update public.finance_extraction_jobs job
  set status = 'running', attempts = attempts + 1,
      lease_token = requested_lease_token, locked_at = now(), error_code = null
  where job.restaurant_id = target_restaurant_id
    and job.document_id = target_document_id
    and job.attempts < 3
    and (
      job.status in ('queued', 'failed')
      or (job.status = 'running' and job.locked_at < now() - interval '10 minutes')
    )
  returning job.* into claimed;
  if claimed.id is null then return null; end if;
  update public.finance_documents
  set status = 'processing', error_code = null
  where id = target_document_id and restaurant_id = target_restaurant_id;
  return to_jsonb(claimed);
end;
$claim_finance_extraction_job$;

create or replace function public.complete_finance_extraction_job(
  target_restaurant_id uuid,
  target_document_id uuid,
  requested_lease_token uuid,
  requested_extraction_version text,
  requested_confidence text,
  requested_extracted_json jsonb,
  requested_warnings jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $complete_finance_extraction_job$
declare changed integer;
begin
  update public.finance_extraction_jobs
  set status = 'succeeded', completed_at = now(), error_code = null
  where restaurant_id = target_restaurant_id and document_id = target_document_id
    and status = 'running' and lease_token = requested_lease_token;
  get diagnostics changed = row_count;
  if changed <> 1 then return false; end if;
  update public.finance_documents
  set status = 'extracted', extraction_version = requested_extraction_version,
      confidence = requested_confidence, extracted_json = requested_extracted_json,
      extraction_warnings = requested_warnings, error_code = null
  where id = target_document_id and restaurant_id = target_restaurant_id;
  return true;
end;
$complete_finance_extraction_job$;

create or replace function public.fail_finance_extraction_job(
  target_restaurant_id uuid,
  target_document_id uuid,
  requested_lease_token uuid,
  requested_error_code text
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $fail_finance_extraction_job$
declare changed integer;
begin
  update public.finance_extraction_jobs
  set status = 'failed', completed_at = now(),
      error_code = left(requested_error_code, 80)
  where restaurant_id = target_restaurant_id and document_id = target_document_id
    and status = 'running' and lease_token = requested_lease_token;
  get diagnostics changed = row_count;
  if changed <> 1 then return false; end if;
  update public.finance_documents
  set status = 'failed', error_code = left(requested_error_code, 80)
  where id = target_document_id and restaurant_id = target_restaurant_id;
  return true;
end;
$fail_finance_extraction_job$;

create or replace function public.approve_finance_document(
  target_restaurant_id uuid,
  target_document_id uuid,
  requested_category_id uuid,
  requested_supplier_name text,
  requested_invoice_number text,
  requested_incurred_on date,
  requested_subtotal_fils bigint,
  requested_input_vat_fils bigint,
  requested_total_fils bigint,
  requested_vat_inclusive boolean,
  requested_payment_status text,
  requested_payment_method text,
  requested_paid_on date,
  requested_description text,
  requested_lines jsonb,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $approve_finance_document$
declare
  document_row public.finance_documents;
  existing_expense_id uuid;
  new_expense_id uuid;
  line_record jsonb;
  line_index integer := 0;
begin
  select id into existing_expense_id from public.finance_expenses
  where restaurant_id = target_restaurant_id
    and source_document_id = target_document_id;
  if existing_expense_id is not null then return existing_expense_id; end if;

  select * into document_row from public.finance_documents
  where id = target_document_id and restaurant_id = target_restaurant_id
  for update;
  if document_row.id is null or document_row.status <> 'extracted' then
    raise exception 'Document is not ready for approval';
  end if;
  if exists (
    select 1
    from public.finance_expenses expense
    join public.finance_documents prior_document
      on prior_document.id = expense.source_document_id
     and prior_document.restaurant_id = expense.restaurant_id
    where expense.restaurant_id = target_restaurant_id
      and prior_document.file_hash = document_row.file_hash
      and prior_document.id <> target_document_id
      and expense.status <> 'void'
  ) then
    raise exception 'Duplicate document has already been posted';
  end if;
  if not exists (
    select 1 from public.finance_categories
    where id = requested_category_id and restaurant_id = target_restaurant_id and is_active
  ) then raise exception 'Invalid finance category'; end if;
  if requested_total_fils <= 0 or requested_subtotal_fils < 0
     or requested_input_vat_fils < 0
     or requested_subtotal_fils + requested_input_vat_fils <> requested_total_fils then
    raise exception 'Expense totals do not reconcile';
  end if;
  if jsonb_typeof(requested_lines) <> 'array' or jsonb_array_length(requested_lines) > 100 then
    raise exception 'Invalid expense lines';
  end if;

  insert into public.finance_expenses (
    restaurant_id, category_id, source, source_document_id, description,
    supplier_name, invoice_number, incurred_on, subtotal_fils, input_vat_fils,
    total_fils, vat_inclusive, status, payment_status, payment_method, paid_on,
    created_by, updated_by, approved_by, approved_at
  ) values (
    target_restaurant_id, requested_category_id, 'scan', target_document_id,
    requested_description, nullif(trim(requested_supplier_name), ''),
    nullif(trim(requested_invoice_number), ''), requested_incurred_on,
    requested_subtotal_fils, requested_input_vat_fils, requested_total_fils,
    requested_vat_inclusive, 'approved', requested_payment_status,
    nullif(requested_payment_method, ''), requested_paid_on,
    event_actor_user_id, event_actor_user_id, event_actor_user_id, now()
  ) returning id into new_expense_id;

  for line_record in select value from jsonb_array_elements(requested_lines)
  loop
    line_index := line_index + 1;
    insert into public.finance_expense_lines (
      restaurant_id, expense_id, line_number, description, quantity, unit,
      unit_price_fils, amount_fils, tax_fils, classification
    ) values (
      target_restaurant_id, new_expense_id, line_index,
      left(trim(line_record->>'description'), 240),
      nullif(line_record->>'quantity', '')::numeric,
      nullif(left(trim(line_record->>'unit'), 40), ''),
      nullif(line_record->>'unit_price_fils', '')::bigint,
      (line_record->>'amount_fils')::bigint,
      coalesce(nullif(line_record->>'tax_fils', '')::bigint, 0),
      coalesce(nullif(line_record->>'classification', ''), 'expense')
    );
  end loop;

  update public.finance_documents set status = 'reviewed'
  where id = target_document_id and restaurant_id = target_restaurant_id;
  return new_expense_id;
end;
$approve_finance_document$;

alter table public.finance_documents enable row level security;
alter table public.finance_extraction_jobs enable row level security;
alter table public.finance_expense_lines enable row level security;
alter table public.finance_scan_attempts enable row level security;

revoke all on public.finance_documents, public.finance_extraction_jobs,
  public.finance_expense_lines, public.finance_scan_attempts
from public, anon, authenticated;
grant select on public.finance_documents, public.finance_extraction_jobs,
  public.finance_expense_lines to authenticated;
grant all on public.finance_documents, public.finance_extraction_jobs,
  public.finance_expense_lines, public.finance_scan_attempts to service_role;

create policy finance_documents_permitted_read
on public.finance_documents for select to authenticated
using (public.has_finance_permission(restaurant_id, 'view'));
create policy finance_extraction_jobs_permitted_read
on public.finance_extraction_jobs for select to authenticated
using (public.has_finance_permission(restaurant_id, 'view'));
create policy finance_expense_lines_permitted_read
on public.finance_expense_lines for select to authenticated
using (public.has_finance_permission(restaurant_id, 'view'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'finance-documents', 'finance-documents', false, 10 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

revoke all on function public.check_finance_scan_rate_limit(uuid, uuid),
  public.create_finance_document_job(uuid, uuid, text, text, text, integer, integer, text, uuid),
  public.claim_finance_extraction_job(uuid, uuid, uuid),
  public.complete_finance_extraction_job(uuid, uuid, uuid, text, text, jsonb, jsonb),
  public.fail_finance_extraction_job(uuid, uuid, uuid, text),
  public.approve_finance_document(uuid, uuid, uuid, text, text, date, bigint,
    bigint, bigint, boolean, text, text, date, text, jsonb, uuid)
from public, anon, authenticated;
grant execute on function public.check_finance_scan_rate_limit(uuid, uuid),
  public.create_finance_document_job(uuid, uuid, text, text, text, integer, integer, text, uuid),
  public.claim_finance_extraction_job(uuid, uuid, uuid),
  public.complete_finance_extraction_job(uuid, uuid, uuid, text, text, jsonb, jsonb),
  public.fail_finance_extraction_job(uuid, uuid, uuid, text),
  public.approve_finance_document(uuid, uuid, uuid, text, text, date, bigint,
    bigint, bigint, boolean, text, text, date, text, jsonb, uuid)
to service_role;

do $verify_finance_scanner_security$
begin
  if exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename in ('finance_documents', 'finance_extraction_jobs',
        'finance_expense_lines', 'finance_scan_attempts')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then raise exception 'Finance scanner write policy detected'; end if;
  if exists (
    select 1 from storage.buckets where id = 'finance-documents' and public
  ) then raise exception 'Finance documents bucket must remain private'; end if;
end;
$verify_finance_scanner_security$;

comment on table public.finance_documents is
  'Private tenant bill metadata. Retention defaults to seven years; unposted documents may be deleted by authorized server actions.';
comment on table public.finance_extraction_jobs is
  'Durable, lease-claimed, at-most-three-attempt AI extraction jobs.';
comment on column public.finance_documents.extracted_json is
  'Untrusted AI output normalized into the application schema; never posts without review.';

notify pgrst, 'reload schema';
