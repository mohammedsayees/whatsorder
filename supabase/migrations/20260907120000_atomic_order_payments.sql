-- Apply before deploying the server actions that call record_order_payment.
-- Payment, completion/loyalty, and audit either all commit or all roll back.
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

  return jsonb_build_object('order_id', target_order_id, 'changed', true);
end;
$payment$;

revoke all on function public.record_order_payment(uuid, uuid, text, boolean, uuid)
from public, anon, authenticated;
grant execute on function public.record_order_payment(uuid, uuid, text, boolean, uuid)
to service_role;
notify pgrst, 'reload schema';
