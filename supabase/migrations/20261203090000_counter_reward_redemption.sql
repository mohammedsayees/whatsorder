-- Redeem a stamp-card reward on a counter (staff) order.
--
-- redeem_loyalty_reward_for_order(restaurant, order): for the order's customer
-- (matched by phone within the restaurant), if their balance covers one full
-- card, deduct it, log a 'redeemed' transaction linked to the order, record
-- points_redeemed on the order and add "Loyalty reward: free <reward>" to its
-- notes so the KOT/receipt tell the kitchen. Prices and totals are unchanged:
-- the reward is handed over free, not discounted from the bill.
--
-- Idempotent per order (unique 'redeemed' row per order): a retried or
-- replayed submission returns the earlier result and never deducts twice.
-- Service-role only; the staff server action calls it after saving the order.

begin;

create unique index if not exists idx_loyalty_one_redeemed_transaction_per_order
on public.loyalty_transactions (order_id)
where type = 'redeemed' and order_id is not null;

create or replace function public.redeem_loyalty_reward_for_order(
  p_restaurant_id uuid,
  p_order_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  order_record public.orders%rowtype;
  customer_record public.customers%rowtype;
  rest_enabled boolean;
  rest_required integer;
  rest_reward text;
  reward_note text;
  redemption_id uuid;
begin
  select * into order_record
  from public.orders
  where id = p_order_id
    and restaurant_id = p_restaurant_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;
  if order_record.status = 'Cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'order_cancelled');
  end if;
  if nullif(btrim(coalesce(order_record.customer_phone, '')), '') is null then
    return jsonb_build_object('ok', false, 'reason', 'no_phone');
  end if;

  select loyalty_enabled, loyalty_stamps_required, loyalty_reward_description
    into rest_enabled, rest_required, rest_reward
  from public.restaurants
  where id = p_restaurant_id;

  reward_note := 'Loyalty reward: free ' || coalesce(nullif(btrim(rest_reward), ''), 'reward');

  -- Already redeemed on this order: same answer, no second deduction.
  if exists (
    select 1 from public.loyalty_transactions
    where order_id = p_order_id and type = 'redeemed'
  ) then
    return jsonb_build_object('ok', true, 'already', true, 'reward', rest_reward);
  end if;

  if not coalesce(rest_enabled, true) or coalesce(rest_required, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'loyalty_off');
  end if;

  select * into customer_record
  from public.customers
  where restaurant_id = p_restaurant_id
    and phone = order_record.customer_phone
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'customer_not_found');
  end if;
  if customer_record.loyalty_points_balance < rest_required then
    return jsonb_build_object(
      'ok', false,
      'reason', 'not_enough_stamps',
      'stamps', customer_record.loyalty_points_balance,
      'required', rest_required
    );
  end if;

  insert into public.loyalty_transactions (
    restaurant_id, customer_id, order_id, type, points, description
  )
  values (
    p_restaurant_id, customer_record.id, p_order_id,
    'redeemed', -rest_required, 'Reward redeemed at the counter'
  )
  on conflict (order_id) where type = 'redeemed' and order_id is not null
  do nothing
  returning id into redemption_id;

  if redemption_id is null then
    return jsonb_build_object('ok', true, 'already', true, 'reward', rest_reward);
  end if;

  update public.customers
  set loyalty_points_balance = loyalty_points_balance - rest_required
  where id = customer_record.id
    and restaurant_id = p_restaurant_id;

  update public.orders
  set points_redeemed = rest_required,
      notes = left(
        case
          when nullif(btrim(coalesce(notes, '')), '') is null then reward_note
          else btrim(notes) || E'\n' || reward_note
        end,
        1000
      )
  where id = p_order_id
    and restaurant_id = p_restaurant_id;

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'reward', rest_reward,
    'stamps_remaining', customer_record.loyalty_points_balance - rest_required
  );
end;
$function$;

revoke all on function public.redeem_loyalty_reward_for_order(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.redeem_loyalty_reward_for_order(uuid, uuid) to service_role;

commit;
