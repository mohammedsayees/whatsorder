-- "Scan to collect your stamp" on counter receipts.
--
-- claim_order_stamp(restaurant, order, phone): attaches a customer's VERIFIED
-- phone (from their WhatsApp-signed session; the server action passes it) to
-- a counter order that was saved without one, then gives that order its
-- stamp exactly like a counter sale with a phone would have received it:
--   * ensure a customers row (existing rows untouched; a new row records
--     order-processing consent only, never marketing);
--   * if the order is already Completed, award one stamp with the usual rules
--     (loyalty on, optional minimum amount) and idempotency (one earned row
--     per order), refreshing the customer's totals; a kitchen order earns it
--     later through transition_order_status_and_award_loyalty.
--
-- A claim is possible once per order, only for staff orders, not cancelled,
-- placed in the last 24 hours, with no phone yet. Re-claiming with the same
-- phone returns the earlier result. Service-role only.

begin;

create or replace function public.claim_order_stamp(
  p_restaurant_id uuid,
  p_order_id uuid,
  p_phone text
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  clean_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  order_record public.orders%rowtype;
  customer_record public.customers%rowtype;
  rest_enabled boolean;
  rest_required integer;
  rest_reward text;
  rest_min_amount numeric;
  stamp_id uuid;
  stamped boolean := false;
begin
  if clean_phone is null or clean_phone !~ '^[0-9]{8,15}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  end if;

  select * into order_record
  from public.orders
  where id = p_order_id
    and restaurant_id = p_restaurant_id
  for update;

  if not found or order_record.source <> 'staff' then
    return jsonb_build_object('ok', false, 'reason', 'order_not_found');
  end if;

  select loyalty_enabled, loyalty_stamps_required, loyalty_reward_description,
         loyalty_qualifying_min_amount
    into rest_enabled, rest_required, rest_reward, rest_min_amount
  from public.restaurants
  where id = p_restaurant_id;

  if nullif(btrim(coalesce(order_record.customer_phone, '')), '') is not null then
    if order_record.customer_phone = clean_phone then
      select * into customer_record
      from public.customers
      where restaurant_id = p_restaurant_id and phone = clean_phone;
      return jsonb_build_object(
        'ok', true,
        'already', true,
        'stamped', exists (
          select 1 from public.loyalty_transactions
          where order_id = p_order_id and type = 'earned'
        ),
        'stamps', coalesce(customer_record.loyalty_points_balance, 0),
        'required', rest_required,
        'reward', rest_reward
      );
    end if;
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end if;

  if order_record.status = 'Cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'order_cancelled');
  end if;
  if order_record.created_at < now() - interval '24 hours' then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if not coalesce(rest_enabled, true) or coalesce(rest_required, 0) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'loyalty_off');
  end if;

  update public.orders
  set customer_phone = clean_phone
  where id = p_order_id
    and restaurant_id = p_restaurant_id;

  insert into public.customers (
    restaurant_id, name, phone, delivery_area, delivery_address,
    consent_order_processing, consent_marketing, consent_timestamp
  )
  values (
    p_restaurant_id,
    coalesce(nullif(btrim(order_record.customer_name), ''), 'Customer'),
    clean_phone, '', '', true, false, now()
  )
  on conflict (restaurant_id, phone) do nothing;

  select * into customer_record
  from public.customers
  where restaurant_id = p_restaurant_id
    and phone = clean_phone
  for update;

  if order_record.status = 'Completed'
     and (rest_min_amount is null or order_record.total >= rest_min_amount) then
    insert into public.loyalty_transactions (
      restaurant_id, customer_id, order_id, type, points, description
    )
    values (
      p_restaurant_id, customer_record.id, p_order_id,
      'earned', 1, 'Stamp claimed from receipt'
    )
    on conflict (order_id) where type = 'earned' and order_id is not null
    do nothing
    returning id into stamp_id;

    if stamp_id is not null then
      stamped := true;
      update public.customers customer
      set
        loyalty_points_balance = customer.loyalty_points_balance + 1,
        lifetime_points_earned = customer.lifetime_points_earned + 1,
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
      where customer.id = customer_record.id
        and customer.restaurant_id = p_restaurant_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'stamped', stamped,
    'pending', order_record.status <> 'Completed',
    'stamps', customer_record.loyalty_points_balance + case when stamped then 1 else 0 end,
    'required', rest_required,
    'reward', rest_reward
  );
end;
$function$;

revoke all on function public.claim_order_stamp(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_order_stamp(uuid, uuid, text) to service_role;

commit;
