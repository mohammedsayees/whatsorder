-- Close a business day only when every order the shifts page offers for
-- assignment has been assigned. Requires 20261121090000_assign_unassigned_shift_orders.sql.
--
-- Before: the check only looked at orders CREATED after the day opened. The
-- day opens with its first shift, so orders completed before that (e.g. the
-- morning, before anyone opened a shift) never blocked the close and stayed
-- unassigned for good.
--
-- Now it uses the same window as assign_unassigned_orders_to_open_shift:
-- completed (closed_at, else created_at) after the previous business day was
-- closed. Older unassigned orders still never block.
--
-- close_business_day is re-declared with ONE change, the window condition.
-- Every other line is identical to 20261112180000_shift_report_live_recalculation.sql.

begin;
set local lock_timeout = '5s';

create or replace function public.close_business_day(
  target_restaurant_id uuid,
  target_business_day_id uuid,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $close_business_day$
declare
  actor_role text;
  target_day public.business_days%rowtype;
  tenant public.restaurants%rowtype;
  snapshot jsonb;
  closed_timestamp timestamptz := now();
  shift_count integer;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);
  if actor_role is null or actor_role not in ('restaurant_admin', 'owner', 'manager') then
    raise exception 'Only restaurant management can close a business day';
  end if;

  select * into target_day from public.business_days
  where id = target_business_day_id and restaurant_id = target_restaurant_id
    and status = 'open' for update;
  if not found then raise exception 'Open business day not found'; end if;

  select * into tenant from public.restaurants where id = target_restaurant_id;

  if exists (
    select 1 from public.restaurant_shifts
    where restaurant_id = target_restaurant_id
      and business_day_id = target_business_day_id and status = 'open'
  ) then raise exception 'Close every shift before closing the business day'; end if;

  select count(*) into shift_count from public.restaurant_shifts
  where restaurant_id = target_restaurant_id and business_day_id = target_business_day_id;
  if shift_count = 0 then raise exception 'The business day has no shifts'; end if;

  if exists (
    select 1 from public.orders
    where restaurant_id = target_restaurant_id
      and status in ('New', 'Accepted', 'Preparing', 'Ready to Serve', 'Out for Delivery')
  ) then raise exception 'Cannot close the business day while active orders remain'; end if;

  if exists (
    select 1 from public.orders
    where restaurant_id = target_restaurant_id and status = 'Completed'
      and shift_id is null
      and coalesce(closed_at, created_at) >= public.unassigned_shift_order_window_start(target_restaurant_id)
  ) then raise exception 'Assign completed orders before closing the business day'; end if;

  select jsonb_build_object(
    'schema_version', 1,
    'report_version', 1,
    'business_day_id', target_business_day_id,
    'business_date', target_day.business_date,
    'restaurant_id', target_restaurant_id,
    'restaurant_name', tenant.name,
    'country_code', tenant.country_code,
    'currency_code', tenant.currency_code,
    'time_zone', tenant.time_zone,
    'opened_at', min(shift.opened_at),
    'closed_at', max(shift.closed_at),
    'report_generated_at', closed_timestamp,
    'shift_count', count(*)::integer,
    'completed_order_count', coalesce(sum(shift.completed_order_count), 0),
    'cancelled_order_count', coalesce(sum(shift.cancelled_order_count), 0),
    'whatsorder_sales', coalesce(sum(shift.completed_sales), 0),
    'marketplace_sales', coalesce(sum(shift.marketplace_sales_total), 0),
    'combined_operational_sales', coalesce(sum(shift.combined_operational_sales), 0),
    'other_income_total', coalesce(sum(shift.other_income_total), 0),
    'cash_other_income_total', coalesce(sum(shift.cash_other_income_total), 0),
    'card_other_income_total', coalesce(sum(shift.card_other_income_total), 0),
    'upi_other_income_total', coalesce(sum(shift.upi_other_income_total), 0),
    'bank_other_income_total', coalesce(sum(shift.bank_other_income_total), 0),
    'credit_repayment_total', coalesce(sum(
      coalesce((shift.other_income_breakdown->>'customer_credit_repayment')::numeric, 0)
    ), 0),
    -- Credit repayments settle sales already counted when the order completed.
    'total_operational_receipts', coalesce(sum(
      shift.combined_operational_sales + shift.other_income_total
      - coalesce((shift.other_income_breakdown->>'customer_credit_repayment')::numeric, 0)
    ), 0),
    'cash_order_sales', coalesce(sum(shift.completed_cash_order_total), 0),
    'card_order_sales', coalesce(sum(shift.card_on_delivery_total - shift.card_other_income_total), 0),
    'upi_order_sales', coalesce(sum(shift.upi_total - shift.upi_other_income_total), 0),
    'cash_paid_out_total', coalesce(sum(shift.cash_paid_out_total), 0),
    'net_cash_movement', coalesce(sum(
      shift.completed_cash_order_total + shift.cash_other_income_total - shift.cash_paid_out_total
    ), 0),
    'cash_difference_total', coalesce(sum(shift.difference_amount), 0),
    'card_difference_total', coalesce(sum(shift.card_difference_amount), 0),
    'upi_difference_total', coalesce(sum(shift.upi_difference_amount), 0),
    'final_cash_counted', (array_agg(shift.cash_counted_amount order by shift.closed_at desc))[1],
    'shifts', jsonb_agg(jsonb_build_object(
      'id', shift.id,
      'name', shift.shift_name,
      'opened_at', shift.opened_at,
      'closed_at', shift.closed_at,
      'completed_orders', shift.completed_order_count,
      'sales', shift.completed_sales,
      'marketplace_sales', shift.marketplace_sales_total,
      'other_income', shift.other_income_total,
      'cash_paid_outs', shift.cash_paid_out_total,
      'opening_cash', shift.opening_cash_amount,
      'expected_cash', shift.expected_cash_amount,
      'cash_counted', shift.cash_counted_amount,
      'cash_difference', shift.difference_amount,
      'report_version', shift.close_report_version
    ) order by shift.opened_at),
    'other_income_breakdown', coalesce((
      select jsonb_object_agg(category, total)
      from (
        select entry.category, sum(entry.amount)::numeric(10, 2) as total
        from public.shift_other_income_entries entry
        join public.restaurant_shifts income_shift on income_shift.id = entry.shift_id
          and income_shift.restaurant_id = entry.restaurant_id
        where entry.restaurant_id = target_restaurant_id
          and income_shift.business_day_id = target_business_day_id
          and entry.voided_at is null
        group by entry.category
      ) categories
    ), '{}'::jsonb)
  ) into snapshot
  from public.restaurant_shifts shift
  where shift.restaurant_id = target_restaurant_id
    and shift.business_day_id = target_business_day_id and shift.status = 'closed';

  update public.business_days set
    status = 'closed', closed_by_user_id = event_actor_user_id,
    closed_at = closed_timestamp, close_report_snapshot = snapshot,
    close_report_generated_at = closed_timestamp, close_report_version = 1
  where id = target_business_day_id and restaurant_id = target_restaurant_id;

  insert into public.business_day_close_reports (
    restaurant_id, business_day_id, version, snapshot, created_by_user_id
  ) values (
    target_restaurant_id, target_business_day_id, 1, snapshot, event_actor_user_id
  );
  return target_business_day_id;
end;
$close_business_day$;

revoke all on function public.close_business_day(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.close_business_day(uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';

commit;

-- Rollback: re-apply close_business_day from
-- 20261112180000_shift_report_live_recalculation.sql.
