-- History backfill: applied directly to production on 2026-06-28 (recorded
-- remotely as version 20260628025722) before the migration-first guardrail
-- caught it. Content below is verbatim from the remote migration history so
-- the local directory matches the remote version list. Do not re-apply by
-- hand; note the customers_restaurant_phone_uniq constraint added here was
-- later dropped as a duplicate by 20260702120000_audit_hardening.

-- ============================================================
-- Loyalty stamp card — phase 1 cutover (rev 2, reconciled to live schema)
-- Re-scales the existing points engine to a 1-stamp-per-visit card.
-- Single accrual site is transition_order_status_and_award_loyalty; swapped in place.
-- ============================================================

-- 1. Per-restaurant stamp-card config (defaults apply to existing rows).
alter table restaurants
  add column if not exists loyalty_enabled              boolean not null default true,
  add column if not exists loyalty_stamps_required      int     not null default 10
       check (loyalty_stamps_required between 2 and 50),
  add column if not exists loyalty_reward_description    text    not null default 'Free regular karak',
  add column if not exists loyalty_qualifying_min_amount numeric;

-- 2. Win-back tracking on the existing customer entity.
alter table customers
  add column if not exists loyalty_last_winback_at timestamptz;

-- 3. Identity key (verified: 0 duplicate (restaurant_id, phone) groups).
alter table customers
  add constraint customers_restaurant_phone_uniq unique (restaurant_id, phone);

-- 4. Win-back scan index (opted-in only).
create index if not exists customers_winback_idx
  on customers (restaurant_id, last_order_at)
  where marketing_opt_in;
-- NOTE: the (order_id) where type='earned' idempotency index already exists
-- (the existing function's ON CONFLICT clause depends on it), so it is not recreated.

-- 5. Swap the earn rule: 1 stamp per qualifying completed order, in place.
--    Signature, state machine, idempotency, and stats recompute are unchanged.
create or replace function public.transition_order_status_and_award_loyalty(
  target_restaurant_id uuid, target_order_id uuid, target_status text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  order_record public.orders%rowtype;
  expected_status text;
  customer_record public.customers%rowtype;
  earned_points integer;
  loyalty_transaction_id uuid;
  rest_loyalty_enabled boolean;
  rest_min_amount numeric;
begin
  select *
  into order_record
  from public.orders
  where id = target_order_id
    and restaurant_id = target_restaurant_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  expected_status := case
    when order_record.status = 'New' then 'Accepted'
    when order_record.status = 'Accepted' then 'Preparing'
    when order_record.status = 'Preparing' and order_record.fulfilment_type = 'delivery'
      then 'Out for Delivery'
    when order_record.status = 'Preparing' and order_record.fulfilment_type = 'dine_in'
      then 'Ready to Serve'
    when order_record.status = 'Preparing' then 'Completed'
    when order_record.status in ('Ready to Serve', 'Out for Delivery') then 'Completed'
    else null
  end;

  if target_status = 'Cancelled' then
    if order_record.status in ('Completed', 'Cancelled') then
      raise exception 'This order cannot be cancelled';
    end if;
  elsif expected_status is null or target_status <> expected_status then
    raise exception 'Invalid order status transition';
  end if;

  update public.orders
  set status = target_status::public.order_status
  where id = target_order_id
    and restaurant_id = target_restaurant_id;

  if target_status = 'Completed' then
    -- STAMP CARD: one stamp per qualifying completed order (was floor(total) points).
    select loyalty_enabled, loyalty_qualifying_min_amount
      into rest_loyalty_enabled, rest_min_amount
    from public.restaurants
    where id = target_restaurant_id;

    if coalesce(rest_loyalty_enabled, true)
       and (rest_min_amount is null or order_record.total >= rest_min_amount) then
      earned_points := 1;
    else
      earned_points := 0;
    end if;

    select *
    into customer_record
    from public.customers
    where restaurant_id = target_restaurant_id
      and phone = order_record.customer_phone
    for update;

    if found and earned_points > 0 then
      insert into public.loyalty_transactions (
        restaurant_id, customer_id, order_id, type, points, description
      )
      values (
        target_restaurant_id, customer_record.id, target_order_id,
        'earned', earned_points, 'Stamp earned for completed order'
      )
      on conflict (order_id) where type = 'earned' and order_id is not null
      do nothing
      returning id into loyalty_transaction_id;

      if loyalty_transaction_id is not null then
        update public.customers
        set
          loyalty_points_balance = loyalty_points_balance + earned_points,
          lifetime_points_earned = lifetime_points_earned + earned_points
        where id = customer_record.id
          and restaurant_id = target_restaurant_id;

        update public.orders
        set points_earned = earned_points
        where id = target_order_id
          and restaurant_id = target_restaurant_id;
      end if;
    end if;
  end if;

  update public.customers customer
  set
    total_orders = (
      select count(*)::integer
      from public.orders order_row
      where order_row.restaurant_id = customer.restaurant_id
        and order_row.customer_phone = customer.phone
        and order_row.status = 'Completed'
    ),
    total_spend = coalesce((
      select sum(order_row.total)
      from public.orders order_row
      where order_row.restaurant_id = customer.restaurant_id
        and order_row.customer_phone = customer.phone
        and order_row.status = 'Completed'
    ), 0),
    last_order_at = (
      select max(order_row.created_at)
      from public.orders order_row
      where order_row.restaurant_id = customer.restaurant_id
        and order_row.customer_phone = customer.phone
        and order_row.status = 'Completed'
    )
  where customer.restaurant_id = target_restaurant_id
    and customer.phone = order_record.customer_phone;

  return target_order_id;
end;
$function$;

-- 6. Staff-confirmed redemption.
create or replace function public.redeem_loyalty_reward(p_customer_id uuid, p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cust public.customers%rowtype;
  v_required int;
begin
  select * into v_cust from public.customers where id = p_customer_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'customer_not_found');
  end if;

  select loyalty_stamps_required into v_required
  from public.restaurants where id = v_cust.restaurant_id;
  v_required := coalesce(v_required, 10);

  if v_cust.loyalty_points_balance < v_required then
    return jsonb_build_object('ok', false, 'reason', 'not_enough_stamps',
      'stamps', v_cust.loyalty_points_balance, 'required', v_required);
  end if;

  insert into public.loyalty_transactions (restaurant_id, customer_id, order_id, type, points, description)
  values (v_cust.restaurant_id, p_customer_id, p_order_id, 'redeemed', -v_required, 'Reward redeemed');

  update public.customers
  set loyalty_points_balance = loyalty_points_balance - v_required
  where id = p_customer_id;

  if p_order_id is not null then
    update public.orders set points_redeemed = v_required where id = p_order_id;
  end if;

  return jsonb_build_object('ok', true, 'redeemed', v_required,
    'stamps_remaining', v_cust.loyalty_points_balance - v_required);
end;
$function$;

-- 7. CUTOVER: fresh cards. Old earn rows stay as ledger history; balances re-scale to stamps.
update customers set loyalty_points_balance = 0;
