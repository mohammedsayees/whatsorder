-- Smart Finance phase 3: attach a receipt photo to a shift cash paid-out.
-- Requires 20261119090000, 20261119120000 and 20261120090000.
--
-- Whoever may record paid-outs on an open shift (the shift opener or
-- management) can attach one receipt to a paid-out. The receipt joins the normal
-- Finance bill-review queue; the uploader never sees what was read from it.
-- When a Finance approver posts that receipt, the new expense is linked to its
-- paid-out in the same transaction (same mismatch rules as phase 1).
--
-- No shift function or shift calculation is changed.

alter table public.finance_documents
  add column shift_paid_out_id uuid,
  add constraint finance_documents_paid_out_tenant_fk
    foreign key (shift_paid_out_id, restaurant_id)
    references public.shift_cash_paid_outs(id, restaurant_id);

-- One live receipt per paid-out. Deleting an unposted receipt frees the slot.
create unique index finance_documents_active_paid_out_receipt
  on public.finance_documents(shift_paid_out_id)
  where shift_paid_out_id is not null and status <> 'deleted';

-- Upload a receipt for a paid-out. The file is already in private storage.
create or replace function public.create_paid_out_receipt_job(
  target_restaurant_id uuid,
  target_paid_out_id uuid,
  requested_document_id uuid,
  requested_storage_path text,
  requested_original_name text,
  requested_mime_type text,
  requested_byte_size integer,
  requested_page_count integer,
  requested_file_hash text,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_paid_out_receipt_job$
declare
  actor_role text;
  paid_out_row public.shift_cash_paid_outs%rowtype;
  shift_row public.restaurant_shifts%rowtype;
  restaurant_row public.restaurants%rowtype;
begin
  select * into restaurant_row from public.restaurants where id = target_restaurant_id;
  if restaurant_row.id is null or restaurant_row.finance_enabled is not true
     or restaurant_row.currency_code <> 'AED' then
    raise exception 'Receipts are not available for this restaurant';
  end if;

  select * into paid_out_row from public.shift_cash_paid_outs
  where id = target_paid_out_id and restaurant_id = target_restaurant_id
  for update;
  if paid_out_row.id is null or paid_out_row.voided_at is not null then
    raise exception 'Paid-out not found or voided';
  end if;

  select * into shift_row from public.restaurant_shifts
  where id = paid_out_row.shift_id and restaurant_id = target_restaurant_id;
  if shift_row.status is distinct from 'open' then
    raise exception 'Receipts can be attached only while the shift is open';
  end if;

  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);
  if actor_role is null or (actor_role = 'staff' and shift_row.opened_by_user_id <> event_actor_user_id) then
    raise exception 'Only the shift opener or restaurant management can attach a receipt';
  end if;

  if exists (select 1 from public.finance_paid_out_links
    where paid_out_id = target_paid_out_id and removed_at is null) then
    raise exception 'This paid-out already has a bill';
  end if;
  if exists (select 1 from public.finance_documents
    where shift_paid_out_id = target_paid_out_id and status <> 'deleted') then
    raise exception 'A receipt is already attached to this paid-out';
  end if;

  perform public.create_finance_document_job(
    target_restaurant_id, requested_document_id, requested_storage_path,
    requested_original_name, requested_mime_type, requested_byte_size,
    requested_page_count, requested_file_hash, event_actor_user_id
  );
  update public.finance_documents set shift_paid_out_id = target_paid_out_id
  where id = requested_document_id and restaurant_id = target_restaurant_id;
  return requested_document_id;
end;
$create_paid_out_receipt_job$;

-- Post a paid-out's receipt: approve the reviewed document as a cash expense
-- and link it to its paid-out, or nothing at all.
create or replace function public.approve_finance_paid_out_receipt(
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
  requested_description text,
  requested_lines jsonb,
  confirm_mismatch boolean,
  requested_mismatch_reason text,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $approve_finance_paid_out_receipt$
declare
  paid_out_id uuid;
  new_expense_id uuid;
begin
  select shift_paid_out_id into paid_out_id from public.finance_documents
  where id = target_document_id and restaurant_id = target_restaurant_id;
  if paid_out_id is null then
    raise exception 'This bill is not a paid-out receipt';
  end if;
  if exists (select 1 from public.finance_expenses
    where restaurant_id = target_restaurant_id and source_document_id = target_document_id) then
    raise exception 'This bill has already been posted';
  end if;
  new_expense_id := public.approve_finance_document(
    target_restaurant_id, target_document_id, requested_category_id,
    requested_supplier_name, requested_invoice_number, requested_incurred_on,
    requested_subtotal_fils, requested_input_vat_fils, requested_total_fils,
    requested_vat_inclusive, 'paid', 'cash', current_date, requested_description,
    requested_lines, event_actor_user_id
  );
  -- Enforces: paid-out not voided, not already linked, Finance on, AED, and
  -- a confirmed reason when the amounts differ. Sets cash / paid or partial.
  perform public.link_finance_paid_out_to_expense(
    target_restaurant_id, paid_out_id, new_expense_id,
    confirm_mismatch, requested_mismatch_reason, event_actor_user_id
  );
  return new_expense_id;
end;
$approve_finance_paid_out_receipt$;

revoke all on function
  public.create_paid_out_receipt_job(uuid, uuid, uuid, text, text, text, integer, integer, text, uuid),
  public.approve_finance_paid_out_receipt(uuid, uuid, uuid, text, text, date, bigint, bigint, bigint, boolean, text, jsonb, boolean, text, uuid)
from public, anon, authenticated;
grant execute on function
  public.create_paid_out_receipt_job(uuid, uuid, uuid, text, text, text, integer, integer, text, uuid),
  public.approve_finance_paid_out_receipt(uuid, uuid, uuid, text, text, date, bigint, bigint, bigint, boolean, text, jsonb, boolean, text, uuid)
to service_role;

comment on column public.finance_documents.shift_paid_out_id is
  'Set when the bill was attached at the till to a shift cash paid-out; posting it links the expense to that paid-out.';

notify pgrst, 'reload schema';

-- Rollback: drop the two functions, the unique index, the foreign key and the
-- shift_paid_out_id column. Receipts already attached stay as ordinary bills.
