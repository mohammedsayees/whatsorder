-- Shift report accuracy fixes. Apply before deploying the matching app code.
--
-- 1. A payment-method correction on an order in a closed shift now recalculates
--    that shift's expected cash/card/UPI and differences as a new, audited
--    report version. Previously the order changed but the frozen report kept
--    the old expected amounts, so it disagreed with the Reports page.
-- 2. An offline receipt synced after its shift closed (late_shift_entry) is now
--    folded into that shift's report as a new version, instead of only being
--    shown as an addendum. If the shift's business day is already closed the
--    receipt stays an addendum: closed business-day reports are final.
-- 3. Customer credit repayments are other income for drawer reconciliation, but
--    the credit sale was already counted in sales when the order completed.
--    "Total operational receipts" no longer counts that money twice.
--
-- Counted cash, terminal totals, marketplace figures and notes are never changed
-- by a recalculation: only system-derived expected amounts and differences.

-- Automatic recalculations (e.g. a late offline receipt) have no human actor.
alter table public.shift_close_reports
  alter column created_by_user_id drop not null;

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

-- Recalculates a closed shift's system-derived totals from live orders and, if
-- anything changed, saves them as the next report version. Returns the current
-- report version, or null when there is no report to update (a legacy closed
-- shift without a report, or a closed business day when skipping is allowed).
-- Callers must already hold, or be able to take, the shift row lock.
create or replace function public.refresh_closed_shift_report(
  target_restaurant_id uuid,
  target_shift_id uuid,
  requested_reason text,
  event_actor_user_id uuid,
  skip_if_business_day_closed boolean
)
returns integer
language plpgsql
security definer
set search_path = public
as $refresh_shift_report$
declare
  target_shift public.restaurant_shifts%rowtype;
  day_status text;
  summary jsonb;
  new_expected_cash numeric(10, 2);
  new_expected_card numeric(10, 2);
  new_expected_upi numeric(10, 2);
  new_completed_sales numeric(10, 2);
  new_other_income numeric(10, 2);
  new_credit_repayments numeric(10, 2);
  cash_difference numeric(10, 2);
  card_difference numeric(10, 2);
  upi_difference numeric(10, 2);
  combined_sales numeric(10, 2);
  next_version integer;
  report_snapshot jsonb;
  generated_timestamp timestamptz := now();
begin
  if nullif(trim(requested_reason), '') is null then
    raise exception 'A recalculation reason is required';
  end if;

  select * into target_shift from public.restaurant_shifts
  where id = target_shift_id and restaurant_id = target_restaurant_id
    and status = 'closed'
  for update;
  if not found or target_shift.close_report_version = 0
     or target_shift.close_report_snapshot is null then
    return null;
  end if;

  if target_shift.business_day_id is not null then
    -- Share-lock serializes with close_business_day, which locks the day row
    -- for update before aggregating its shifts.
    select status into day_status from public.business_days
    where id = target_shift.business_day_id and restaurant_id = target_restaurant_id
    for share;
    if day_status = 'closed' then
      if skip_if_business_day_closed then return null; end if;
      raise exception 'This shift belongs to a closed business day and can no longer be corrected';
    end if;
  end if;

  summary := public.calculate_restaurant_shift_summary(target_restaurant_id, target_shift_id);
  new_expected_cash := (summary->>'expected_cash_amount')::numeric(10, 2);
  new_expected_card := (summary->>'card_on_delivery_total')::numeric(10, 2);
  new_expected_upi := (summary->>'upi_total')::numeric(10, 2);
  new_completed_sales := (summary->>'completed_sales')::numeric(10, 2);
  new_other_income := (summary->>'other_income_total')::numeric(10, 2);
  new_credit_repayments := (summary->>'credit_repayment_total')::numeric(10, 2);

  if target_shift.expected_cash_amount is not distinct from new_expected_cash
     and target_shift.card_on_delivery_total is not distinct from new_expected_card
     and target_shift.upi_total is not distinct from new_expected_upi
     and target_shift.completed_sales is not distinct from new_completed_sales
     and target_shift.completed_order_count
       is not distinct from (summary->>'completed_order_count')::integer
     and target_shift.completed_cash_order_total
       is not distinct from (summary->>'completed_cash_order_total')::numeric(10, 2)
     and target_shift.cash_paid_out_total
       is not distinct from (summary->>'cash_paid_out_total')::numeric(10, 2)
     and target_shift.other_income_total is not distinct from new_other_income then
    return target_shift.close_report_version;
  end if;

  cash_difference := target_shift.cash_counted_amount - new_expected_cash;
  card_difference := target_shift.card_terminal_total - new_expected_card;
  upi_difference := case when target_shift.upi_reported_total is not null
    then target_shift.upi_reported_total - new_expected_upi else null end;
  combined_sales := new_completed_sales + target_shift.marketplace_sales_total;
  next_version := target_shift.close_report_version + 1;

  report_snapshot := target_shift.close_report_snapshot || jsonb_build_object(
    'report_version', next_version,
    'report_generated_at', generated_timestamp,
    'correction_reason', left(trim(requested_reason), 500),
    'expected_cash_amount', new_expected_cash,
    'cash_difference_amount', cash_difference,
    'expected_card_amount', new_expected_card,
    'card_difference_amount', card_difference,
    'expected_upi_amount', new_expected_upi,
    'upi_difference_amount', upi_difference,
    'completed_order_count', (summary->>'completed_order_count')::integer,
    'completed_sales', new_completed_sales,
    'completed_cash_order_total', (summary->>'completed_cash_order_total')::numeric(10, 2),
    'cash_paid_out_total', (summary->>'cash_paid_out_total')::numeric(10, 2),
    'fulfilment_breakdown', summary->'fulfilment_breakdown',
    'combined_operational_sales', combined_sales,
    'other_income_total', new_other_income,
    'cash_other_income_total', (summary->>'cash_other_income_total')::numeric(10, 2),
    'card_other_income_total', (summary->>'card_other_income_total')::numeric(10, 2),
    'upi_other_income_total', (summary->>'upi_other_income_total')::numeric(10, 2),
    'bank_other_income_total', (summary->>'bank_other_income_total')::numeric(10, 2),
    'credit_repayment_total', new_credit_repayments,
    'other_income_breakdown', summary->'other_income_breakdown',
    'combined_operational_receipts', combined_sales + new_other_income - new_credit_repayments
  );

  update public.restaurant_shifts set
    expected_cash_amount = new_expected_cash,
    difference_amount = cash_difference,
    card_on_delivery_total = new_expected_card,
    card_difference_amount = card_difference,
    upi_total = new_expected_upi,
    upi_difference_amount = upi_difference,
    completed_order_count = (summary->>'completed_order_count')::integer,
    completed_sales = new_completed_sales,
    completed_cash_order_total = (summary->>'completed_cash_order_total')::numeric(10, 2),
    cash_paid_out_total = (summary->>'cash_paid_out_total')::numeric(10, 2),
    fulfilment_breakdown = summary->'fulfilment_breakdown',
    combined_operational_sales = combined_sales,
    other_income_total = new_other_income,
    cash_other_income_total = (summary->>'cash_other_income_total')::numeric(10, 2),
    card_other_income_total = (summary->>'card_other_income_total')::numeric(10, 2),
    upi_other_income_total = (summary->>'upi_other_income_total')::numeric(10, 2),
    bank_other_income_total = (summary->>'bank_other_income_total')::numeric(10, 2),
    other_income_breakdown = summary->'other_income_breakdown',
    close_report_snapshot = report_snapshot,
    close_report_generated_at = generated_timestamp,
    close_report_version = next_version
  where id = target_shift_id and restaurant_id = target_restaurant_id;

  insert into public.shift_close_reports (
    restaurant_id, shift_id, version, snapshot, correction_reason, created_by_user_id
  ) values (
    target_restaurant_id, target_shift_id, next_version, report_snapshot,
    left(trim(requested_reason), 500), event_actor_user_id
  );

  return next_version;
end;
$refresh_shift_report$;

create or replace function public.payment_method_short_label(method text)
returns text
language sql
immutable
set search_path = ''
as $payment_label$
  select case method
    when 'Cash on Delivery' then 'Cash'
    when 'Card on Delivery' then 'Card'
    when 'UPI' then 'UPI'
    when 'Customer Credit' then 'Customer credit'
    else coalesce(method, 'Unrecorded')
  end;
$payment_label$;

-- Unchanged from 20260907120000 except the closed-shift recalculation at the end.
create or replace function public.record_order_payment(
  target_restaurant_id uuid,
  target_order_id uuid,
  requested_payment_method text,
  complete_order boolean,
  event_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $payment$
declare
  actor_role text;
  restaurant_country text;
  saved_order public.orders%rowtype;
  saved_shift_status text;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);
  if actor_role is null then
    raise exception 'Restaurant membership required';
  end if;

  select country_code into restaurant_country
  from public.restaurants where id = target_restaurant_id;
  if requested_payment_method is null
     or requested_payment_method not in ('Cash on Delivery', 'Card on Delivery', 'UPI')
     or (requested_payment_method = 'UPI' and restaurant_country is distinct from 'IN')
     or complete_order is null then
    raise exception 'Invalid payment request';
  end if;

  -- Match completion's shift-before-order lock order and serialize with closure.
  perform id from public.restaurant_shifts
  where restaurant_id = target_restaurant_id
    and (status = 'open' or id = (
      select shift_id from public.orders
      where id = target_order_id and restaurant_id = target_restaurant_id
    ))
  order by id for update;

  select * into saved_order from public.orders
  where id = target_order_id and restaurant_id = target_restaurant_id
  for update;
  if not found then raise exception 'Order not found'; end if;

  if saved_order.shift_id is not null then
    select status into saved_shift_status from public.restaurant_shifts
    where id = saved_order.shift_id and restaurant_id = target_restaurant_id;
  end if;

  if complete_order then
    if saved_order.payment_method is not null
       and saved_order.payment_method::text <> requested_payment_method then
      raise exception 'A different payment method is already recorded';
    end if;
    if saved_order.status = 'Completed'
       and saved_order.payment_method::text = requested_payment_method then
      return jsonb_build_object('order_id', saved_order.id, 'changed', false);
    end if;
    if saved_shift_status = 'closed' then
      raise exception 'Cannot collect payment in a closed shift';
    end if;
  else
    if saved_order.payment_method is null then
      raise exception 'Set payment when completing the order';
    end if;
    if saved_order.payment_method::text = requested_payment_method then
      return jsonb_build_object('order_id', saved_order.id, 'changed', false);
    end if;
    if saved_shift_status = 'closed' and actor_role = 'staff' then
      raise exception 'Only management can correct a closed shift payment';
    end if;
  end if;

  if saved_order.payment_method::text is distinct from requested_payment_method then
    update public.orders
    set payment_method = requested_payment_method::public.payment_method
    where id = target_order_id and restaurant_id = target_restaurant_id;

    insert into public.order_payment_events (
      restaurant_id, order_id, from_method, to_method, actor_user_id, actor_role
    ) values (
      target_restaurant_id, target_order_id, saved_order.payment_method::text,
      requested_payment_method, event_actor_user_id, actor_role
    );
  end if;

  if complete_order then
    perform public.transition_order_status_and_record_event(
      target_restaurant_id, target_order_id, 'Completed',
      event_actor_user_id, actor_role, null
    );
  end if;

  -- A correction in a closed shift moves money between cash and card; the
  -- shift's expected amounts and differences must follow it.
  if not complete_order and saved_shift_status = 'closed'
     and saved_order.status = 'Completed' then
    perform public.refresh_closed_shift_report(
      target_restaurant_id, saved_order.shift_id,
      'Automatic: payment for order #' || upper(right(saved_order.id::text, 8))
        || ' corrected from ' || public.payment_method_short_label(saved_order.payment_method::text)
        || ' to ' || public.payment_method_short_label(requested_payment_method),
      event_actor_user_id, false
    );
  end if;

  return jsonb_build_object('order_id', target_order_id, 'changed', true);
end;
$payment$;

-- Late offline receipts join their original shift's report. assign_staff_order_shift
-- already holds that shift's row lock for this insert.
create or replace function public.refresh_shift_report_for_late_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $late_receipt$
begin
  perform public.refresh_closed_shift_report(
    new.restaurant_id, new.shift_id,
    'Automatic: offline receipt for order #' || upper(right(new.id::text, 8))
      || ' synced after shift close',
    null, true
  );
  return null;
end;
$late_receipt$;

drop trigger if exists orders_refresh_shift_report_for_late_receipt on public.orders;
create trigger orders_refresh_shift_report_for_late_receipt
after insert on public.orders
for each row when (new.late_shift_entry and new.shift_id is not null)
execute function public.refresh_shift_report_for_late_receipt();

-- Unchanged from 20260722120000 except credit repayments are no longer counted
-- twice in combined_operational_receipts.
create or replace function public.close_restaurant_shift_v3(
  target_restaurant_id uuid,
  target_shift_id uuid,
  requested_cash_counted_amount numeric,
  requested_card_terminal_total numeric,
  requested_upi_reported_total numeric,
  requested_marketplace_sales jsonb,
  requested_closing_note text,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $close_shift_v3$
declare
  closed_shift_id uuid;
  summary jsonb;
  patched_snapshot jsonb;
  credit_repayments numeric(10, 2);
begin
  closed_shift_id := public.close_restaurant_shift_v2(
    target_restaurant_id, target_shift_id, requested_cash_counted_amount,
    requested_card_terminal_total, requested_upi_reported_total,
    requested_marketplace_sales, requested_closing_note, event_actor_user_id
  );
  summary := public.calculate_restaurant_shift_summary(target_restaurant_id, target_shift_id);
  credit_repayments := (summary->>'credit_repayment_total')::numeric(10, 2);

  update public.restaurant_shifts
  set other_income_total = (summary->>'other_income_total')::numeric,
      cash_other_income_total = (summary->>'cash_other_income_total')::numeric,
      card_other_income_total = (summary->>'card_other_income_total')::numeric,
      upi_other_income_total = (summary->>'upi_other_income_total')::numeric,
      bank_other_income_total = (summary->>'bank_other_income_total')::numeric,
      other_income_breakdown = summary->'other_income_breakdown',
      close_report_snapshot = close_report_snapshot || jsonb_build_object(
        'other_income_total', (summary->>'other_income_total')::numeric,
        'cash_other_income_total', (summary->>'cash_other_income_total')::numeric,
        'card_other_income_total', (summary->>'card_other_income_total')::numeric,
        'upi_other_income_total', (summary->>'upi_other_income_total')::numeric,
        'bank_other_income_total', (summary->>'bank_other_income_total')::numeric,
        'credit_repayment_total', credit_repayments,
        'other_income_breakdown', summary->'other_income_breakdown',
        'combined_operational_receipts',
          combined_operational_sales + (summary->>'other_income_total')::numeric
          - credit_repayments
      )
  where id = target_shift_id and restaurant_id = target_restaurant_id
  returning close_report_snapshot into patched_snapshot;

  update public.shift_close_reports set snapshot = patched_snapshot
  where restaurant_id = target_restaurant_id and shift_id = target_shift_id and version = 1;
  return closed_shift_id;
end;
$close_shift_v3$;

-- Unchanged from 20260722120000 except: totals are first recalculated from live
-- orders (catching drift from before this migration), and credit repayments are
-- no longer counted twice in combined_operational_receipts.
create or replace function public.revise_restaurant_shift_close_report_v2(
  target_restaurant_id uuid,
  target_shift_id uuid,
  requested_cash_counted_amount numeric,
  requested_card_terminal_total numeric,
  requested_upi_reported_total numeric,
  requested_marketplace_sales jsonb,
  requested_correction_reason text,
  event_actor_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $revise_shift_v2$
declare
  next_version integer;
  patched_snapshot jsonb;
  actor_role text;
begin
  if exists (
    select 1
    from public.restaurant_shifts shift
    join public.business_days day on day.id = shift.business_day_id
      and day.restaurant_id = shift.restaurant_id
    where shift.id = target_shift_id
      and shift.restaurant_id = target_restaurant_id
      and day.status = 'closed'
  ) then
    raise exception 'A shift in a closed business day cannot be corrected';
  end if;

  -- The base revision repeats this check; checking first keeps an
  -- unauthorized caller from creating an automatic version.
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);
  if actor_role is null or actor_role not in ('restaurant_admin', 'owner', 'manager') then
    raise exception 'Only restaurant management can correct a closed shift report';
  end if;

  perform public.refresh_closed_shift_report(
    target_restaurant_id, target_shift_id,
    'Automatic: totals recalculated from orders before correction',
    event_actor_user_id, false
  );

  next_version := public.revise_restaurant_shift_close_report(
    target_restaurant_id, target_shift_id, requested_cash_counted_amount,
    requested_card_terminal_total, requested_upi_reported_total,
    requested_marketplace_sales, requested_correction_reason, event_actor_user_id
  );

  update public.restaurant_shifts
  set close_report_snapshot = close_report_snapshot || jsonb_build_object(
    'other_income_total', other_income_total,
    'cash_other_income_total', cash_other_income_total,
    'card_other_income_total', card_other_income_total,
    'upi_other_income_total', upi_other_income_total,
    'bank_other_income_total', bank_other_income_total,
    'credit_repayment_total',
      coalesce((other_income_breakdown->>'customer_credit_repayment')::numeric, 0),
    'other_income_breakdown', other_income_breakdown,
    'combined_operational_receipts', combined_operational_sales + other_income_total
      - coalesce((other_income_breakdown->>'customer_credit_repayment')::numeric, 0)
  )
  where id = target_shift_id and restaurant_id = target_restaurant_id
  returning close_report_snapshot into patched_snapshot;

  update public.shift_close_reports set snapshot = patched_snapshot
  where restaurant_id = target_restaurant_id and shift_id = target_shift_id
    and version = next_version;
  return next_version;
end;
$revise_shift_v2$;

-- Unchanged from 20260722120000 except credit repayments are not counted twice
-- in total_operational_receipts, and their total is reported separately.
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
      and shift_id is null and created_at >= target_day.opened_at
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


revoke all on function public.refresh_closed_shift_report(uuid, uuid, text, uuid, boolean)
from public, anon, authenticated, service_role;
revoke all on function public.refresh_shift_report_for_late_receipt()
from public, anon, authenticated, service_role;
revoke all on function public.payment_method_short_label(text)
from public, anon, authenticated;
revoke all on function public.calculate_restaurant_shift_summary(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.record_order_payment(uuid, uuid, text, boolean, uuid)
from public, anon, authenticated;
revoke all on function public.close_restaurant_shift_v3(uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid)
from public, anon, authenticated;
revoke all on function public.revise_restaurant_shift_close_report_v2(uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid)
from public, anon, authenticated;
revoke all on function public.close_business_day(uuid, uuid, uuid)
from public, anon, authenticated;

grant execute on function public.calculate_restaurant_shift_summary(uuid, uuid) to service_role;
grant execute on function public.record_order_payment(uuid, uuid, text, boolean, uuid) to service_role;
grant execute on function public.close_restaurant_shift_v3(uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid) to service_role;
grant execute on function public.revise_restaurant_shift_close_report_v2(uuid, uuid, numeric, numeric, numeric, jsonb, text, uuid) to service_role;
grant execute on function public.close_business_day(uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
