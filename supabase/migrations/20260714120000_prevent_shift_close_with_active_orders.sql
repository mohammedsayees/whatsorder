-- Prevent operational shift closure while the restaurant still has active orders.
-- The check lives in the transactional, tenant-scoped RPC so it cannot be
-- bypassed by stale UI state or a direct server-action invocation.

create or replace function public.close_restaurant_shift(
  target_restaurant_id uuid,
  target_shift_id uuid,
  requested_cash_counted_amount numeric,
  requested_closing_note text,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $close_shift$
declare
  actor_role text;
  shift_opener uuid;
  summary jsonb;
  expected_cash numeric(10, 2);
  difference numeric(10, 2);
begin
  actor_role := public.shift_actor_role(
    target_restaurant_id,
    event_actor_user_id
  );

  select opened_by_user_id
  into shift_opener
  from public.restaurant_shifts
  where id = target_shift_id
    and restaurant_id = target_restaurant_id
    and status = 'open'
  for update;

  if not found then
    raise exception 'Open shift not found';
  end if;

  if actor_role is null
     or (
       actor_role = 'staff'
       and shift_opener <> event_actor_user_id
     ) then
    raise exception 'Only the shift opener or restaurant management can close this shift';
  end if;

  if requested_cash_counted_amount is null
     or requested_cash_counted_amount < 0 then
    raise exception 'Counted cash cannot be negative';
  end if;

  if exists (
    select 1
    from public.orders
    where restaurant_id = target_restaurant_id
      and status in (
        'New',
        'Accepted',
        'Preparing',
        'Ready to Serve',
        'Out for Delivery'
      )
  ) then
    raise exception 'Cannot close shift while active orders remain';
  end if;

  summary := public.calculate_restaurant_shift_summary(
    target_restaurant_id,
    target_shift_id
  );

  expected_cash := (summary->>'expected_cash_amount')::numeric(10, 2);
  difference := round(requested_cash_counted_amount, 2) - expected_cash;

  if difference <> 0
     and nullif(trim(requested_closing_note), '') is null then
    raise exception 'A closing note is required when cash has a difference';
  end if;

  update public.restaurant_shifts
  set
    status = 'closed',
    cash_counted_amount = round(requested_cash_counted_amount, 2),
    expected_cash_amount = expected_cash,
    difference_amount = difference,
    completed_order_count =
      (summary->>'completed_order_count')::integer,
    completed_sales = (summary->>'completed_sales')::numeric(10, 2),
    completed_cash_order_total =
      (summary->>'completed_cash_order_total')::numeric(10, 2),
    card_on_delivery_total =
      (summary->>'card_on_delivery_total')::numeric(10, 2),
    cash_paid_out_total =
      (summary->>'cash_paid_out_total')::numeric(10, 2),
    cancelled_order_count =
      (summary->>'cancelled_order_count')::integer,
    fulfilment_breakdown = summary->'fulfilment_breakdown',
    closing_note = nullif(left(trim(requested_closing_note), 500), ''),
    closed_by_user_id = event_actor_user_id,
    closed_at = now()
  where id = target_shift_id
    and restaurant_id = target_restaurant_id
    and status = 'open';

  return target_shift_id;
end;
$close_shift$;

