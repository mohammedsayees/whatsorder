-- Smart Finance phase 2: post a cash bill straight to the open shift.
-- Requires 20261119090000_finance_shift_paid_out_links.sql and
-- 20261119120000_shift_cash_paid_out_voids.sql.
--
-- One transaction creates the approved expense, a cash paid-out on the open
-- shift for the bill total, and the link between them. If any step fails,
-- nothing is saved.
--
-- No shift function is redefined. The paid-out is created by the existing
-- add_shift_cash_paid_out (which enforces "open shift" and "shift opener or
-- management") and linked by the existing link_finance_paid_out_to_expense
-- (which enforces Finance enabled, AED, one paid-out = one bill, and sets the
-- expense to paid in cash on the shift's business date).

-- Internal: pay an existing approved expense from the open shift's drawer.
create or replace function public.finance_pay_expense_from_till(
  target_restaurant_id uuid,
  target_expense_id uuid,
  target_shift_id uuid,
  allow_same_amount_paid_out boolean,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $finance_pay_expense_from_till$
declare
  expense_row public.finance_expenses;
  shift_status text;
  paid_out_reason text;
  new_paid_out_id uuid;
begin
  select status into shift_status from public.restaurant_shifts
  where id = target_shift_id and restaurant_id = target_restaurant_id
  for update;
  if shift_status is distinct from 'open' then
    raise exception 'The shift is no longer open';
  end if;

  select * into expense_row from public.finance_expenses
  where id = target_expense_id and restaurant_id = target_restaurant_id;
  if expense_row.id is null or expense_row.status <> 'approved' then
    raise exception 'Only an approved expense can be paid from the till';
  end if;

  -- The same bill may already have been recorded at the till.
  if allow_same_amount_paid_out is not true and exists (
    select 1 from public.shift_cash_paid_outs paid_out
    where paid_out.restaurant_id = target_restaurant_id
      and paid_out.shift_id = target_shift_id
      and paid_out.voided_at is null
      and round(paid_out.amount * 100)::bigint = expense_row.total_fils
      and not exists (
        select 1 from public.finance_paid_out_links link
        where link.paid_out_id = paid_out.id and link.removed_at is null
      )
  ) then
    raise exception 'A paid-out of the same amount without a bill is already on this shift';
  end if;

  paid_out_reason := left(
    'Bill: ' || coalesce(
      nullif(trim(concat_ws(' · ', nullif(trim(expense_row.supplier_name), ''),
        case when nullif(trim(expense_row.invoice_number), '') is not null
          then '#' || trim(expense_row.invoice_number) end)), ''),
      trim(expense_row.description)
    ),
    300
  );

  new_paid_out_id := public.add_shift_cash_paid_out(
    target_restaurant_id, target_shift_id,
    (expense_row.total_fils::numeric / 100)::numeric(10, 2),
    paid_out_reason, event_actor_user_id
  );
  perform public.link_finance_paid_out_to_expense(
    target_restaurant_id, new_paid_out_id, target_expense_id, false, null, event_actor_user_id
  );
  return new_paid_out_id;
end;
$finance_pay_expense_from_till$;

-- Scanned bill: approve the reviewed document and pay it from the till.
create or replace function public.approve_finance_document_from_till(
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
  target_shift_id uuid,
  allow_same_amount_paid_out boolean,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $approve_finance_document_from_till$
declare
  new_expense_id uuid;
begin
  -- Refuse a retry of an already-posted document: approve_finance_document
  -- would return the existing expense, which may already be paid another way.
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
  perform public.finance_pay_expense_from_till(
    target_restaurant_id, new_expense_id, target_shift_id,
    allow_same_amount_paid_out, event_actor_user_id
  );
  return new_expense_id;
end;
$approve_finance_document_from_till$;

-- Manual expense: record an approved expense and pay it from the till.
create or replace function public.create_finance_expense_from_till(
  target_restaurant_id uuid,
  requested_category_id uuid,
  requested_description text,
  requested_supplier_name text,
  requested_incurred_on date,
  requested_subtotal_fils bigint,
  requested_input_vat_fils bigint,
  requested_total_fils bigint,
  requested_vat_inclusive boolean,
  requested_service_period_start date,
  requested_service_period_end date,
  requested_recurring_cost_id uuid,
  target_shift_id uuid,
  allow_same_amount_paid_out boolean,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $create_finance_expense_from_till$
declare
  new_expense_id uuid;
begin
  if not exists (select 1 from public.finance_categories
    where id = requested_category_id and restaurant_id = target_restaurant_id and is_active) then
    raise exception 'Invalid finance category';
  end if;
  if requested_recurring_cost_id is not null and not exists (
    select 1 from public.finance_recurring_costs
    where id = requested_recurring_cost_id and restaurant_id = target_restaurant_id and is_active
  ) then
    raise exception 'Invalid recurring schedule';
  end if;

  insert into public.finance_expenses (
    restaurant_id, category_id, source, description, supplier_name, incurred_on,
    service_period_start, service_period_end, recurring_cost_id,
    subtotal_fils, input_vat_fils, total_fils, vat_inclusive, status,
    payment_status, payment_method, paid_on,
    created_by, updated_by, approved_by, approved_at
  ) values (
    target_restaurant_id, requested_category_id, 'manual', trim(requested_description),
    nullif(trim(coalesce(requested_supplier_name, '')), ''), requested_incurred_on,
    requested_service_period_start, requested_service_period_end, requested_recurring_cost_id,
    requested_subtotal_fils, requested_input_vat_fils, requested_total_fils,
    requested_vat_inclusive, 'approved', 'paid', 'cash', current_date,
    event_actor_user_id, event_actor_user_id, event_actor_user_id, now()
  ) returning id into new_expense_id;

  perform public.finance_pay_expense_from_till(
    target_restaurant_id, new_expense_id, target_shift_id,
    allow_same_amount_paid_out, event_actor_user_id
  );
  return new_expense_id;
end;
$create_finance_expense_from_till$;

revoke all on function
  public.finance_pay_expense_from_till(uuid, uuid, uuid, boolean, uuid),
  public.approve_finance_document_from_till(uuid, uuid, uuid, text, text, date, bigint, bigint, bigint, boolean, text, jsonb, uuid, boolean, uuid),
  public.create_finance_expense_from_till(uuid, uuid, text, text, date, bigint, bigint, bigint, boolean, date, date, uuid, uuid, boolean, uuid)
from public, anon, authenticated;
grant execute on function
  public.finance_pay_expense_from_till(uuid, uuid, uuid, boolean, uuid),
  public.approve_finance_document_from_till(uuid, uuid, uuid, text, text, date, bigint, bigint, bigint, boolean, text, jsonb, uuid, boolean, uuid),
  public.create_finance_expense_from_till(uuid, uuid, text, text, date, bigint, bigint, bigint, boolean, date, date, uuid, uuid, boolean, uuid)
to service_role;

notify pgrst, 'reload schema';

-- Rollback: drop the three functions above. No table or column is changed.
