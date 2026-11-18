-- Customer credit in shift and business-day reports.
-- Requires 20261121220000_shift_report_itemized_sync.sql.
--
-- Credit sales were counted in completed sales but no report said so, and
-- repayments only appeared as one other-income category.
--
-- 1. Shift report versions also record credit_sales: each completed order on
--    "Customer Credit" in the shift (order id, customer id, amount, due date).
--    Customer NAMES are not stored: reports are immutable, so the app looks
--    names up per tenant when the report is viewed. Repayments are already in
--    other_income_entries (category customer_credit_repayment); those entries
--    now carry customer_id, and their description/reference (which contain the
--    customer's name and ID) are replaced with a neutral label in the report.
--    shift_report_itemized_entries gains the list; the itemizing trigger now
--    treats credit_sales like the other two lists (recomputed for every new
--    version, filled in on update when missing).
-- 2. Business-day report versions record a credit block when written: sold on
--    credit (count, total), collected (total and by payment method) across the
--    day's shifts, and, at close, total owed and overdue across all customers
--    (customer_credit_portfolio, the same figures the owner report uses).
--    A second trigger keeps business_days.close_report_snapshot equal to the
--    latest version, as for shifts.
--
-- No existing function body other than the two itemizing ones changes; no
-- existing report is backfilled.

begin;
set local lock_timeout = '5s';

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
    ), '[]'::jsonb)
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
     or not (new.snapshot ? 'credit_sales') then
    new.snapshot := (new.snapshot - 'paid_outs' - 'other_income_entries' - 'credit_sales')
      || public.shift_report_itemized_entries(new.restaurant_id, new.shift_id);
  end if;
  return new;
end;
$add_itemized_entries$;

create or replace function public.business_day_credit_summary(
  target_restaurant_id uuid,
  target_business_day_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $business_day_credit$
  with day_shifts as (
    select id from public.restaurant_shifts
    where restaurant_id = target_restaurant_id and business_day_id = target_business_day_id
  ), sold as (
    select count(*)::integer as order_count, coalesce(sum(o.total), 0)::numeric(12, 2) as total
    from public.orders o
    where o.restaurant_id = target_restaurant_id
      and o.shift_id in (select id from day_shifts)
      and o.status = 'Completed' and o.payment_method = 'Customer Credit'
  ), collected as (
    select coalesce(sum(entry.amount), 0)::numeric(12, 2) as total,
      coalesce(jsonb_object_agg(entry.payment_method, entry.amount)
        filter (where entry.payment_method is not null), '{}'::jsonb) as by_method
    from (
      select payment_method, sum(amount)::numeric(12, 2) as amount
      from public.shift_other_income_entries
      where restaurant_id = target_restaurant_id
        and shift_id in (select id from day_shifts)
        and category = 'customer_credit_repayment' and voided_at is null
      group by payment_method
    ) entry
  )
  select jsonb_build_object(
    'sold_order_count', sold.order_count,
    'sold_total', sold.total,
    'collected_total', collected.total,
    'collected_by_method', collected.by_method,
    'outstanding_at_close',
      coalesce((public.customer_credit_portfolio(target_restaurant_id)->>'outstanding')::numeric, 0),
    'overdue_at_close',
      coalesce((public.customer_credit_portfolio(target_restaurant_id)->>'overdue')::numeric, 0)
  )
  from sold cross join collected;
$business_day_credit$;

create or replace function public.add_business_day_report_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $add_business_day_credit$
begin
  if tg_op = 'INSERT' or not (new.snapshot ? 'credit') then
    new.snapshot := (new.snapshot - 'credit') || jsonb_build_object(
      'credit', public.business_day_credit_summary(new.restaurant_id, new.business_day_id)
    );
  end if;
  return new;
end;
$add_business_day_credit$;

drop trigger if exists add_business_day_report_credit on public.business_day_close_reports;
create trigger add_business_day_report_credit
before insert or update of snapshot on public.business_day_close_reports
for each row execute function public.add_business_day_report_credit();

create or replace function public.sync_business_day_report_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $sync_business_day_snapshot$
begin
  update public.business_days
  set close_report_snapshot = new.snapshot
  where id = new.business_day_id
    and restaurant_id = new.restaurant_id
    and close_report_version = new.version
    and close_report_snapshot is distinct from new.snapshot;
  return null;
end;
$sync_business_day_snapshot$;

drop trigger if exists sync_business_day_report_snapshot on public.business_day_close_reports;
create trigger sync_business_day_report_snapshot
after insert or update of snapshot on public.business_day_close_reports
for each row execute function public.sync_business_day_report_snapshot();

revoke all on function public.shift_report_itemized_entries(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.shift_report_itemized_entries(uuid, uuid) to service_role;
revoke all on function public.business_day_credit_summary(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.business_day_credit_summary(uuid, uuid) to service_role;
revoke all on function public.add_shift_report_itemized_entries(),
  public.add_business_day_report_credit(),
  public.sync_business_day_report_snapshot()
from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- Rollback: drop triggers add_business_day_report_credit and
-- sync_business_day_report_snapshot on public.business_day_close_reports;
-- drop business_day_credit_summary, add_business_day_report_credit and
-- sync_business_day_report_snapshot; re-apply shift_report_itemized_entries
-- from 20261121210000 and add_shift_report_itemized_entries from
-- 20261121220000. Versions written meanwhile keep their extra keys (ignored).
