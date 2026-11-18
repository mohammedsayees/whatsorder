-- Opening cash carries forward from the last count.
-- Requires 20261122090000_shift_credit_reporting.sql.
--
-- In 92 of 240 Chai Xpress shifts the opening cash differed from the previous
-- shift's counted cash, with no record of why; it included typos such as
-- 30.75 entered as 3,075 (a AED -2,988.25 "shortage").
--
-- 1. restaurant_shifts.previous_cash_counted_amount: the last closed shift's
--    counted cash when this shift opened (null for a restaurant's first
--    shift); opening_cash_reason: why the opening cash differs from it.
-- 2. open_restaurant_shift_v3 wraps open_restaurant_shift_v2 unchanged. When
--    a previous count exists and the opening cash differs from it by 0.01 or
--    more, a reason (3-300 characters) is required. Cash taken out or added
--    between shifts (bank deposit, owner withdrawal, top-up) goes in that
--    reason.
-- 3. Shift report versions record opening_check (last count, opening cash,
--    difference, reason) through the existing itemizing trigger.
--
-- open_restaurant_shift_v2 is not changed; existing shifts are not backfilled.

begin;
set local lock_timeout = '5s';

alter table public.restaurant_shifts
  add column if not exists previous_cash_counted_amount numeric(10, 2),
  add column if not exists opening_cash_reason text;

alter table public.restaurant_shifts
  drop constraint if exists restaurant_shifts_opening_cash_reason_check;
alter table public.restaurant_shifts
  add constraint restaurant_shifts_opening_cash_reason_check check (
    opening_cash_reason is null or char_length(trim(opening_cash_reason)) between 3 and 300
  );

create or replace function public.open_restaurant_shift_v3(
  target_restaurant_id uuid,
  requested_shift_name text,
  requested_opening_cash_amount numeric,
  requested_opening_note text,
  requested_opening_cash_reason text,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $open_shift_v3$
declare
  previous_count numeric(10, 2);
  reason_text text := nullif(trim(coalesce(requested_opening_cash_reason, '')), '');
  created_shift_id uuid;
begin
  select cash_counted_amount into previous_count
  from public.restaurant_shifts
  where restaurant_id = target_restaurant_id and status = 'closed'
    and cash_counted_amount is not null
  order by closed_at desc nulls last
  limit 1;

  if previous_count is not null and requested_opening_cash_amount is not null
     and abs(round(requested_opening_cash_amount, 2) - previous_count) >= 0.005 then
    if reason_text is null or char_length(reason_text) < 3 then
      raise exception 'Explain why opening cash differs from the last count';
    end if;
  else
    -- Nothing to explain when the opening cash matches.
    reason_text := null;
  end if;
  if reason_text is not null and char_length(reason_text) > 300 then
    raise exception 'Explain why opening cash differs from the last count';
  end if;

  -- Unchanged open: one open shift per restaurant, role checks, business day.
  created_shift_id := public.open_restaurant_shift_v2(
    target_restaurant_id, requested_shift_name, requested_opening_cash_amount,
    requested_opening_note, event_actor_user_id
  );

  update public.restaurant_shifts set
    previous_cash_counted_amount = previous_count,
    opening_cash_reason = reason_text
  where id = created_shift_id and restaurant_id = target_restaurant_id;

  return created_shift_id;
end;
$open_shift_v3$;

create or replace function public.shift_report_itemized_entries(
  target_restaurant_id uuid,
  target_shift_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $itemized_entries$
  select jsonb_build_object(
    'paid_outs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', paid_out.id,
        'amount', paid_out.amount,
        'reason', paid_out.reason,
        'recorded_at', paid_out.recorded_at,
        'voided_at', paid_out.voided_at,
        'void_reason', paid_out.void_reason
      ) order by paid_out.recorded_at, paid_out.id)
      from (
        select * from public.shift_cash_paid_outs
        where restaurant_id = target_restaurant_id and shift_id = target_shift_id
        order by recorded_at, id
        limit 300
      ) paid_out
    ), '[]'::jsonb),
    'other_income_entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', entry.id,
        'category', entry.category,
        'payment_method', entry.payment_method,
        'amount', entry.amount,
        -- Credit repayment descriptions/references carry the customer's name
        -- and ID; immutable reports keep only the customer ID.
        'description', case when entry.category = 'customer_credit_repayment'
          then 'Customer credit repayment' else entry.description end,
        'reference', case when entry.category = 'customer_credit_repayment'
          then null else entry.reference end,
        'customer_id', entry.customer_id,
        'recorded_at', entry.recorded_at,
        'voided_at', entry.voided_at,
        'void_reason', entry.void_reason
      ) order by entry.recorded_at, entry.id)
      from (
        select income.*, account.customer_id
        from public.shift_other_income_entries income
        left join public.customer_credit_entries credit
          on credit.id = income.customer_credit_entry_id
          and credit.restaurant_id = income.restaurant_id
        left join public.customer_credit_accounts account
          on account.id = credit.account_id and account.restaurant_id = credit.restaurant_id
        where income.restaurant_id = target_restaurant_id and income.shift_id = target_shift_id
        order by income.recorded_at, income.id
        limit 300
      ) entry
    ), '[]'::jsonb),
    'credit_sales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'order_id', sale.id,
        'customer_id', sale.customer_id,
        'amount', sale.total,
        'due_date', sale.due_date,
        'completed_at', sale.completed_at
      ) order by sale.completed_at, sale.id)
      from (
        select o.id, o.customer_id, o.total,
          coalesce(o.closed_at, o.created_at) as completed_at,
          (select charge.due_date from public.customer_credit_entries charge
           where charge.restaurant_id = o.restaurant_id and charge.order_id = o.id
             and charge.entry_type = 'charge'
           limit 1) as due_date
        from public.orders o
        where o.restaurant_id = target_restaurant_id and o.shift_id = target_shift_id
          and o.status = 'Completed' and o.payment_method = 'Customer Credit'
        order by coalesce(o.closed_at, o.created_at), o.id
        limit 300
      ) sale
    ), '[]'::jsonb),
    'opening_check', (
      select jsonb_build_object(
        'previous_cash_counted_amount', shift.previous_cash_counted_amount,
        'opening_cash_amount', shift.opening_cash_amount,
        'difference', case when shift.previous_cash_counted_amount is null then null
          else shift.opening_cash_amount - shift.previous_cash_counted_amount end,
        'reason', shift.opening_cash_reason
      )
      from public.restaurant_shifts shift
      where shift.id = target_shift_id and shift.restaurant_id = target_restaurant_id
    )
  );
$itemized_entries$;

create or replace function public.add_shift_report_itemized_entries()
returns trigger
language plpgsql
security definer
set search_path = public
as $add_itemized_entries$
begin
  -- A new version records the entries as they are now; an update in the same
  -- transaction keeps lists it already has.
  if tg_op = 'INSERT'
     or not (new.snapshot ? 'paid_outs')
     or not (new.snapshot ? 'other_income_entries')
     or not (new.snapshot ? 'credit_sales')
     or not (new.snapshot ? 'opening_check') then
    new.snapshot := (new.snapshot - 'paid_outs' - 'other_income_entries' - 'credit_sales' - 'opening_check')
      || public.shift_report_itemized_entries(new.restaurant_id, new.shift_id);
  end if;
  return new;
end;
$add_itemized_entries$;

revoke all on function public.open_restaurant_shift_v3(uuid, text, numeric, text, text, uuid)
from public, anon, authenticated;
grant execute on function public.open_restaurant_shift_v3(uuid, text, numeric, text, text, uuid)
to service_role;
revoke all on function public.shift_report_itemized_entries(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.shift_report_itemized_entries(uuid, uuid) to service_role;
revoke all on function public.add_shift_report_itemized_entries()
from public, anon, authenticated;

comment on column public.restaurant_shifts.previous_cash_counted_amount is
  'The last closed shift''s counted cash when this shift opened (null if none).';
comment on column public.restaurant_shifts.opening_cash_reason is
  'Why opening cash differs from previous_cash_counted_amount (cash drop, top-up, recount).';

notify pgrst, 'reload schema';

commit;

-- Rollback: point the app back at open_restaurant_shift_v2, then drop
-- open_restaurant_shift_v3; re-apply shift_report_itemized_entries and
-- add_shift_report_itemized_entries from 20261122090000; drop the constraint
-- and the two columns.
