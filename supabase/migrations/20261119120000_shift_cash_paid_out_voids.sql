-- Void incorrect shift cash paid-outs (e.g. the same bill entered twice).
-- Requires 20261119090000_finance_shift_paid_out_links.sql to be applied first.
--
-- 1. Paid-outs gain void columns (same pattern as shift_other_income_entries).
--    Voided rows are kept for audit and excluded from expected cash.
-- 2. calculate_restaurant_shift_summary is re-declared with ONE change: the
--    paid_outs CTE ignores voided rows. Every other line is identical to
--    20261112180000_shift_report_live_recalculation.sql.
-- 3. void_shift_cash_paid_out:
--    - open shift: opener or management; expected cash updates live.
--    - closed shift: management only, business day still open; the existing
--      refresh_closed_shift_report saves a new audited report version.
--      Counted cash and notes are never changed.
--    - a closed business day is final: refused.
--    Any active Finance link on the paid-out is released in the same transaction.
-- 4. Finance paid-out helpers ignore voided paid-outs.

alter table public.shift_cash_paid_outs
  add column voided_at timestamptz,
  add column voided_by_user_id uuid,
  add column void_reason text check (
    void_reason is null or char_length(trim(void_reason)) between 1 and 300
  ),
  add constraint shift_cash_paid_outs_void_check check (
    (voided_at is null and voided_by_user_id is null and void_reason is null)
    or
    (voided_at is not null and voided_by_user_id is not null and void_reason is not null)
  );

create or replace function public.calculate_restaurant_shift_summary(
  target_restaurant_id uuid,
  target_shift_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $shift_summary$
  with target_shift as (
    select * from public.restaurant_shifts
    where id = target_shift_id and restaurant_id = target_restaurant_id
  ),
  completed as (
    select
      count(*)::integer as completed_order_count,
      coalesce(sum(total), 0)::numeric(10, 2) as completed_sales,
      coalesce(sum(total) filter (where payment_method = 'Cash on Delivery'), 0)::numeric(10, 2)
        as completed_cash_order_total,
      coalesce(sum(total) filter (where payment_method = 'Card on Delivery'), 0)::numeric(10, 2)
        as completed_card_order_total,
      coalesce(sum(total) filter (where payment_method = 'UPI'), 0)::numeric(10, 2)
        as completed_upi_order_total
    from public.orders
    where restaurant_id = target_restaurant_id
      and shift_id = target_shift_id and status = 'Completed'
  ),
  paid_outs as (
    select coalesce(sum(amount), 0)::numeric(10, 2) as cash_paid_out_total
    from public.shift_cash_paid_outs
    where restaurant_id = target_restaurant_id and shift_id = target_shift_id
      and voided_at is null
  ),
  other_income as (
    select
      coalesce(sum(amount), 0)::numeric(10, 2) as total,
      coalesce(sum(amount) filter (where payment_method = 'cash'), 0)::numeric(10, 2) as cash_total,
      coalesce(sum(amount) filter (where payment_method = 'card'), 0)::numeric(10, 2) as card_total,
      coalesce(sum(amount) filter (where payment_method = 'upi'), 0)::numeric(10, 2) as upi_total,
      coalesce(sum(amount) filter (where payment_method = 'bank_transfer'), 0)::numeric(10, 2) as bank_total,
      coalesce(sum(amount) filter (where category = 'customer_credit_repayment'), 0)::numeric(10, 2)
        as credit_repayment_total
    from public.shift_other_income_entries
    where restaurant_id = target_restaurant_id
      and shift_id = target_shift_id and voided_at is null
  ),
  other_breakdown as (
    select coalesce(jsonb_object_agg(category, amount), '{}'::jsonb) as breakdown
    from (
      select category, sum(amount)::numeric(10, 2) as amount
      from public.shift_other_income_entries
      where restaurant_id = target_restaurant_id
        and shift_id = target_shift_id and voided_at is null
      group by category
    ) values_by_category
  ),
  fulfilment as (
    select coalesce(jsonb_object_agg(
      fulfilment_type, jsonb_build_object('orders', order_count, 'sales', sales)
    ), '{}'::jsonb) as breakdown
    from (
      select fulfilment_type, count(*)::integer as order_count,
        sum(total)::numeric(10, 2) as sales
      from public.orders
      where restaurant_id = target_restaurant_id
        and shift_id = target_shift_id and status = 'Completed'
      group by fulfilment_type
    ) values_by_fulfilment
  ),
  cancelled as (
    select count(distinct event.order_id)::integer as cancelled_order_count
    from public.order_status_events event
    cross join target_shift shift
    where event.restaurant_id = target_restaurant_id
      and event.to_status = 'Cancelled'
      and event.created_at >= shift.opened_at
      and event.created_at <= coalesce(shift.closed_at, now())
  )
  select jsonb_build_object(
    'completed_order_count', completed.completed_order_count,
    'completed_sales', completed.completed_sales,
    'completed_cash_order_total', completed.completed_cash_order_total,
    'completed_card_order_total', completed.completed_card_order_total,
    'completed_upi_order_total', completed.completed_upi_order_total,
    -- Compatibility keys are the expected reconciled receipts for the method.
    'card_on_delivery_total', completed.completed_card_order_total + other_income.card_total,
    'upi_total', completed.completed_upi_order_total + other_income.upi_total,
    'cash_paid_out_total', paid_outs.cash_paid_out_total,
    'other_income_total', other_income.total,
    'cash_other_income_total', other_income.cash_total,
    'card_other_income_total', other_income.card_total,
    'upi_other_income_total', other_income.upi_total,
    'bank_other_income_total', other_income.bank_total,
    -- Collected for credit sales already counted in completed_sales.
    'credit_repayment_total', other_income.credit_repayment_total,
    'other_income_breakdown', other_breakdown.breakdown,
    'cancelled_order_count', cancelled.cancelled_order_count,
    'fulfilment_breakdown', fulfilment.breakdown,
    'expected_cash_amount', (
      shift.opening_cash_amount + completed.completed_cash_order_total
      + other_income.cash_total - paid_outs.cash_paid_out_total
    )::numeric(10, 2)
  )
  from target_shift shift
  cross join completed cross join paid_outs cross join other_income
  cross join other_breakdown cross join fulfilment cross join cancelled;
$shift_summary$;

-- Returns null when the shift is open (totals are live), otherwise the new
-- close report version.
create or replace function public.void_shift_cash_paid_out(
  target_restaurant_id uuid,
  target_paid_out_id uuid,
  requested_reason text,
  event_actor_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $void_paid_out$
declare
  actor_role text;
  paid_out_row public.shift_cash_paid_outs%rowtype;
  shift_row public.restaurant_shifts%rowtype;
  reason_text text := trim(coalesce(requested_reason, ''));
  new_version integer;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);
  if reason_text = '' or char_length(reason_text) > 300 then
    raise exception 'A void reason is required';
  end if;

  select * into paid_out_row from public.shift_cash_paid_outs
  where id = target_paid_out_id and restaurant_id = target_restaurant_id;
  if paid_out_row.id is null then raise exception 'Paid-out not found'; end if;

  -- Shift row first (same lock order as close and refresh), then the paid-out.
  select * into shift_row from public.restaurant_shifts
  where id = paid_out_row.shift_id and restaurant_id = target_restaurant_id
  for update;

  if shift_row.status = 'open' then
    if actor_role is null or (actor_role = 'staff' and shift_row.opened_by_user_id <> event_actor_user_id) then
      raise exception 'Only the shift opener or restaurant management can void a paid-out';
    end if;
  else
    if actor_role is null or actor_role = 'staff' then
      raise exception 'Only restaurant management can void a paid-out after shift close';
    end if;
  end if;

  update public.shift_cash_paid_outs set
    voided_at = now(), voided_by_user_id = event_actor_user_id, void_reason = reason_text
  where id = target_paid_out_id and restaurant_id = target_restaurant_id and voided_at is null;
  if not found then raise exception 'Paid-out not found or already voided'; end if;

  -- The cash never left the drawer, so a Finance link to it no longer applies.
  update public.finance_paid_out_links set
    removed_at = now(), removed_by = event_actor_user_id, updated_by = event_actor_user_id,
    removal_reason = left('Paid-out voided: ' || reason_text, 300)
  where restaurant_id = target_restaurant_id and paid_out_id = target_paid_out_id
    and removed_at is null;

  if shift_row.status = 'open' then
    return null;
  end if;

  -- Raises if the business day is closed, which rolls the void back.
  new_version := public.refresh_closed_shift_report(
    target_restaurant_id, shift_row.id,
    left('Cash paid-out voided: ' || reason_text, 500),
    event_actor_user_id, false
  );
  if new_version is null then
    raise exception 'This shift has no close report to update';
  end if;
  return new_version;
end;
$void_paid_out$;

-- Finance helpers: a voided paid-out can't be linked and isn't "without a bill".
create or replace function public.finance_paid_out_context(
  target_restaurant_id uuid, target_paid_out_id uuid
)
returns table (paid_out_amount_fils bigint, paid_out_reason text, business_date date)
language plpgsql security invoker set search_path = public
as $finance_paid_out_context$
declare
  restaurant_row public.restaurants;
begin
  select * into restaurant_row from public.restaurants where id = target_restaurant_id;
  if restaurant_row.id is null or restaurant_row.finance_enabled is not true then
    raise exception 'Finance is not enabled for this restaurant';
  end if;
  if restaurant_row.currency_code <> 'AED' then
    raise exception 'Paid-out linking is only available for AED restaurants';
  end if;

  perform 1 from public.shift_cash_paid_outs paid_out
  where paid_out.id = target_paid_out_id and paid_out.restaurant_id = target_restaurant_id
    and paid_out.voided_at is null
  for update;
  if not found then raise exception 'Paid-out not found'; end if;

  return query
  select round(paid_out.amount * 100)::bigint,
    paid_out.reason,
    coalesce(business_day.business_date,
      (shift.opened_at at time zone restaurant_row.time_zone)::date)
  from public.shift_cash_paid_outs paid_out
  join public.restaurant_shifts shift
    on shift.id = paid_out.shift_id and shift.restaurant_id = paid_out.restaurant_id
  left join public.business_days business_day
    on business_day.id = shift.business_day_id and business_day.restaurant_id = shift.restaurant_id
  where paid_out.id = target_paid_out_id and paid_out.restaurant_id = target_restaurant_id;
end;
$finance_paid_out_context$;

create or replace function public.get_finance_unbilled_paid_outs(
  target_restaurant_id uuid, requested_limit integer default 200
)
returns table (
  paid_out_id uuid, shift_id uuid, shift_status text, amount numeric,
  reason text, recorded_at timestamptz, business_date date
)
language sql stable security invoker set search_path = public
as $get_finance_unbilled_paid_outs$
  select paid_out.id, paid_out.shift_id, shift.status, paid_out.amount, paid_out.reason,
    paid_out.recorded_at,
    coalesce(business_day.business_date, (shift.opened_at at time zone restaurant.time_zone)::date)
  from public.shift_cash_paid_outs paid_out
  join public.restaurants restaurant on restaurant.id = paid_out.restaurant_id
  join public.finance_settings settings on settings.restaurant_id = paid_out.restaurant_id
  join public.restaurant_shifts shift
    on shift.id = paid_out.shift_id and shift.restaurant_id = paid_out.restaurant_id
  left join public.business_days business_day
    on business_day.id = shift.business_day_id and business_day.restaurant_id = shift.restaurant_id
  where paid_out.restaurant_id = target_restaurant_id
    and paid_out.voided_at is null
    and (paid_out.recorded_at at time zone restaurant.time_zone)::date >= settings.paid_out_tracking_from
    and not exists (
      select 1 from public.finance_paid_out_links link
      where link.paid_out_id = paid_out.id and link.removed_at is null
    )
  order by paid_out.recorded_at desc
  limit least(greatest(coalesce(requested_limit, 200), 1), 500);
$get_finance_unbilled_paid_outs$;

revoke all on function public.void_shift_cash_paid_out(uuid, uuid, text, uuid)
from public, anon, authenticated;
grant execute on function public.void_shift_cash_paid_out(uuid, uuid, text, uuid) to service_role;
-- create or replace keeps existing grants; restate them for clarity.
revoke all on function public.finance_paid_out_context(uuid, uuid),
  public.get_finance_unbilled_paid_outs(uuid, integer)
from public, anon, authenticated;
grant execute on function public.finance_paid_out_context(uuid, uuid),
  public.get_finance_unbilled_paid_outs(uuid, integer)
to service_role;

comment on column public.shift_cash_paid_outs.voided_at is
  'Set when a paid-out was entered by mistake. Voided rows are kept and excluded from expected cash.';

notify pgrst, 'reload schema';

-- Rollback: export voided rows first. Re-apply calculate_restaurant_shift_summary
-- from 20261112180000_shift_report_live_recalculation.sql, drop
-- void_shift_cash_paid_out, re-apply the two finance helpers from
-- 20261119090000, then drop the void columns and constraint. Once voids exist,
-- rolling back counts those paid-outs again in any open shift's expected cash.
