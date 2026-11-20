-- Stamp card for counter (staff) orders.
--
-- Until now a stamp was only awarded by transition_order_status_and_award_loyalty,
-- i.e. when an order MOVED to Completed, and only for a phone that already had
-- a customers row. A counter sale paid at the till is inserted as Completed
-- directly and staff orders never create a customers row, so walk-in
-- customers who gave their number never earned stamps (production, last 120
-- days: 142 completed staff orders with a phone, 11 stamped).
--
-- After a staff order with a phone is inserted:
--   1. ensure a customers row exists for (restaurant_id, phone). An existing
--      row is never modified (its name and consents stay as they are); a new
--      row records order-processing consent only, never marketing consent.
--   2. if the order was inserted as Completed, award one stamp with the same
--      rules as the transition function (loyalty enabled, optional minimum
--      amount) and the same idempotency (unique earned row per order), then
--      refresh the customer's order totals.
-- Orders that are sent to the kitchen keep earning their stamp later through
-- transition_order_status_and_award_loyalty, which now finds the customer.
--
-- Additive: one trigger function + one AFTER INSERT trigger. Existing orders
-- are not back-filled.

begin;

create or replace function public.staff_order_customer_and_stamp()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  clean_phone text := nullif(btrim(coalesce(new.customer_phone, '')), '');
  customer_record public.customers%rowtype;
  rest_loyalty_enabled boolean;
  rest_min_amount numeric;
  stamp_id uuid;
begin
  if clean_phone is null then
    return null;
  end if;

  insert into public.customers (
    restaurant_id, name, phone, delivery_area, delivery_address,
    consent_order_processing, consent_marketing, consent_timestamp
  )
  values (
    new.restaurant_id,
    coalesce(nullif(btrim(new.customer_name), ''), 'Customer'),
    clean_phone,
    '',
    '',
    true,
    false,
    coalesce(new.consent_timestamp, now())
  )
  on conflict (restaurant_id, phone) do nothing;

  if new.status <> 'Completed' then
    return null;
  end if;

  select loyalty_enabled, loyalty_qualifying_min_amount
    into rest_loyalty_enabled, rest_min_amount
  from public.restaurants
  where id = new.restaurant_id;

  if not coalesce(rest_loyalty_enabled, true)
     or (rest_min_amount is not null and new.total < rest_min_amount) then
    return null;
  end if;

  select * into customer_record
  from public.customers
  where restaurant_id = new.restaurant_id
    and phone = clean_phone
  for update;

  if not found then
    return null;
  end if;

  insert into public.loyalty_transactions (
    restaurant_id, customer_id, order_id, type, points, description
  )
  values (
    new.restaurant_id, customer_record.id, new.id,
    'earned', 1, 'Stamp earned for completed order'
  )
  on conflict (order_id) where type = 'earned' and order_id is not null
  do nothing
  returning id into stamp_id;

  if stamp_id is not null then
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
      and customer.restaurant_id = new.restaurant_id;
  end if;

  return null;
end;
$function$;

revoke all on function public.staff_order_customer_and_stamp() from public, anon, authenticated;

drop trigger if exists orders_staff_customer_and_stamp on public.orders;
create trigger orders_staff_customer_and_stamp
after insert on public.orders
for each row
when (new.source = 'staff' and nullif(btrim(coalesce(new.customer_phone, '')), '') is not null)
execute function public.staff_order_customer_and_stamp();

commit;
