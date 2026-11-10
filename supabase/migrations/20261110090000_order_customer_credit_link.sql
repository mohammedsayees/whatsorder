-- Persist the exact tenant customer selected at the staff POS. Historical
-- orders keep working through the phone fallback in record_customer_credit_order,
-- while new staff orders can no longer be charged to a same-number guess.

alter table public.orders
  add column if not exists customer_id uuid;

update public.orders saved_order
set customer_id = customer.id
from public.customers customer
where saved_order.customer_id is null
  and nullif(trim(saved_order.customer_phone), '') is not null
  and customer.restaurant_id = saved_order.restaurant_id
  and customer.phone = saved_order.customer_phone;

alter table public.orders
  add constraint orders_customer_tenant_fk
  foreign key (customer_id, restaurant_id)
  references public.customers(id, restaurant_id)
  on delete restrict;

create index orders_restaurant_customer_created_idx
on public.orders(restaurant_id, customer_id, created_at desc)
where customer_id is not null;

create or replace function public.inherit_order_customer_from_parent()
returns trigger
language plpgsql
set search_path = ''
as $inherit_order_customer$
begin
  if new.customer_id is null and new.parent_order_id is not null then
    select parent.customer_id
    into new.customer_id
    from public.orders parent
    where parent.id = new.parent_order_id
      and parent.restaurant_id = new.restaurant_id;
  end if;
  return new;
end;
$inherit_order_customer$;

revoke all on function public.inherit_order_customer_from_parent()
from public, anon, authenticated;

create trigger inherit_order_customer_from_parent_before_insert
before insert on public.orders
for each row
execute function public.inherit_order_customer_from_parent();

create or replace function public.record_customer_credit_order(
  target_restaurant_id uuid,
  target_order_id uuid,
  event_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $credit_order$
declare
  actor_role text;
  order_preview public.orders%rowtype;
  saved_order public.orders%rowtype;
  saved_account public.customer_credit_accounts%rowtype;
  saved_customer public.customers%rowtype;
  current_balance numeric(12, 2);
  local_today date;
  saved_shift_status text;
begin
  actor_role := public.shift_actor_role(target_restaurant_id, event_actor_user_id);
  if actor_role is null then raise exception 'Restaurant membership required'; end if;

  select * into order_preview from public.orders
  where id = target_order_id and restaurant_id = target_restaurant_id;
  if not found then raise exception 'Order not found'; end if;

  perform id from public.restaurant_shifts
  where restaurant_id = target_restaurant_id
    and (status = 'open' or id = order_preview.shift_id)
  order by id for update;

  select * into saved_order from public.orders
  where id = target_order_id and restaurant_id = target_restaurant_id
  for update;

  if saved_order.shift_id is not null then
    select status into saved_shift_status from public.restaurant_shifts
    where id = saved_order.shift_id and restaurant_id = target_restaurant_id;
  end if;
  if saved_shift_status = 'closed' then
    raise exception 'Cannot collect payment in a closed shift';
  end if;

  select customer.* into saved_customer
  from public.customers customer
  where customer.restaurant_id = target_restaurant_id
    and (
      (saved_order.customer_id is not null and customer.id = saved_order.customer_id)
      or (
        saved_order.customer_id is null
        and customer.phone = saved_order.customer_phone
      )
    )
  for update;
  if not found then raise exception 'Customer profile not found'; end if;

  select account.* into saved_account
  from public.customer_credit_accounts account
  where account.restaurant_id = target_restaurant_id
    and account.customer_id = saved_customer.id
  for update;
  if not found or saved_account.is_enabled is false then
    raise exception 'Customer credit is not enabled';
  end if;

  if saved_order.status = 'Completed'
    and saved_order.payment_method::text = 'Customer Credit'
    and exists (
      select 1 from public.customer_credit_entries
      where restaurant_id = target_restaurant_id and order_id = target_order_id
        and entry_type = 'charge'
    ) then
    return jsonb_build_object('order_id', saved_order.id, 'changed', false);
  end if;
  if saved_order.payment_method is not null then
    raise exception 'A different payment method is already recorded';
  end if;

  select coalesce(sum(amount), 0) into current_balance
  from public.customer_credit_entries
  where restaurant_id = target_restaurant_id and account_id = saved_account.id;
  current_balance := greatest(current_balance, 0);
  if current_balance + saved_order.total > saved_account.credit_limit then
    raise exception 'Customer credit limit exceeded';
  end if;

  select (now() at time zone coalesce(time_zone, 'Asia/Dubai'))::date
  into local_today from public.restaurants where id = target_restaurant_id;

  perform set_config('whatsorder.customer_credit_write', 'on', true);
  perform set_config('whatsorder.async_notifications', 'on', true);
  update public.orders set payment_method = 'Customer Credit'::public.payment_method
  where id = target_order_id and restaurant_id = target_restaurant_id;

  insert into public.order_payment_events (
    restaurant_id, order_id, from_method, to_method, actor_user_id, actor_role
  ) values (
    target_restaurant_id, target_order_id, null, 'Customer Credit',
    event_actor_user_id, actor_role
  );

  insert into public.customer_credit_entries (
    restaurant_id, account_id, order_id, entry_type, amount, due_date,
    note, actor_user_id
  ) values (
    target_restaurant_id, saved_account.id, target_order_id, 'charge',
    saved_order.total, local_today + saved_account.terms_days,
    'Order #' || upper(right(saved_order.id::text, 8)), event_actor_user_id
  );

  perform public.transition_order_status_and_record_event(
    target_restaurant_id, target_order_id, 'Completed',
    event_actor_user_id, actor_role, null
  );
  return jsonb_build_object('order_id', target_order_id, 'changed', true);
end;
$credit_order$;

revoke all on function public.record_customer_credit_order(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.record_customer_credit_order(uuid, uuid, uuid)
to service_role;

do $verify_order_customer_link$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_customer_tenant_fk'
      and conrelid = 'public.orders'::regclass
  ) then
    raise exception 'Tenant-consistent order customer foreign key is missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'inherit_order_customer_from_parent_before_insert'
      and tgrelid = 'public.orders'::regclass
      and not tgisinternal
  ) then
    raise exception 'Order customer inheritance trigger is missing';
  end if;
end;
$verify_order_customer_link$;

-- Include the stable link in the operational order board response. Customer
-- name and phone remain immutable order snapshots for receipts and history.
create or replace function public.get_admin_orders_page_v2(
  target_restaurant_id uuid,
  target_status_view text default 'active',
  target_fulfilment text default 'all',
  target_page integer default 1,
  target_page_size integer default 25,
  target_sort text default 'oldest'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_status text := lower(coalesce(target_status_view, 'active'));
  selected_fulfilment text := lower(coalesce(target_fulfilment, 'all'));
  safe_page integer := greatest(1, coalesce(target_page, 1));
  safe_page_size integer := least(100, greatest(1, coalesce(target_page_size, 25)));
  result jsonb;
begin
  if target_restaurant_id is null then
    raise exception 'Restaurant id is required.' using errcode = '22023';
  end if;

  if selected_status not in ('active', 'completed', 'cancelled') then
    raise exception 'Invalid order status view.' using errcode = '22023';
  end if;

  if selected_fulfilment not in ('all', 'delivery', 'takeaway', 'dine_in', 'car_pickup') then
    raise exception 'Invalid fulfilment view.' using errcode = '22023';
  end if;

  with status_orders as materialized (
    select
      orders.id,
      orders.parent_order_id,
      orders.customer_id,
      orders.customer_name,
      orders.customer_phone,
      orders.fulfilment_type,
      orders.car_plate_number,
      orders.car_description,
      orders.table_number,
      orders.delivery_area,
      orders.delivery_address,
      orders.delivery_google_maps_url,
      orders.delivery_landmark,
      orders.notes,
      orders.payment_method,
      orders.items,
      orders.subtotal,
      orders.delivery_fee,
      orders.total,
      orders.points_earned,
      orders.loyalty_discount,
      orders.status,
      orders.created_at,
      orders.status_started_at,
      orders.closed_at,
      orders.source,
      orders.punched_at,
      public.order_start_time(
        orders.created_at, orders.punched_at, orders.source
      ) as order_started_at,
      public.order_start_time(
        orders.created_at, orders.punched_at, orders.source
      ) + make_interval(
        mins => coalesce((
          select (restaurant.order_target_minutes ->> orders.fulfilment_type::text)::integer
          from public.restaurants restaurant
          where restaurant.id = target_restaurant_id
        ), 30)
      ) as due_at
    from public.orders
    where orders.restaurant_id = target_restaurant_id
      and case selected_status
        when 'active' then orders.status in (
          'New', 'Accepted', 'Preparing', 'Ready to Serve', 'Out for Delivery'
        )
        when 'completed' then orders.status = 'Completed'
        else orders.status = 'Cancelled'
      end
  ),
  fulfilment_counts as (
    select
      count(*) as all_count,
      count(*) filter (where fulfilment_type = 'delivery') as delivery_count,
      count(*) filter (where fulfilment_type = 'takeaway') as takeaway_count,
      count(*) filter (where fulfilment_type = 'dine_in') as dine_in_count,
      count(*) filter (where fulfilment_type = 'car_pickup') as car_pickup_count
    from status_orders
  ),
  filtered_orders as materialized (
    select *
    from status_orders
    where selected_fulfilment = 'all'
       or fulfilment_type = selected_fulfilment
  ),
  paged_orders as (
    select coalesce(
      jsonb_agg(
        to_jsonb(page_row)
        order by
          case when selected_status = 'active' and target_sort = 'overdue'
            then page_row.due_at end asc,
          case when selected_status = 'active'
            then page_row.order_started_at end asc,
          case when selected_status <> 'active'
            then page_row.created_at end desc
      ),
      '[]'::jsonb
    ) as items
    from (
      select *
      from filtered_orders
      order by
        case when selected_status = 'active' and target_sort = 'overdue'
          then due_at end asc,
        case when selected_status = 'active' then order_started_at end asc,
        case when selected_status <> 'active' then created_at end desc
      limit safe_page_size
      offset (safe_page - 1) * safe_page_size
    ) as page_row
  )
  select jsonb_build_object(
    'items', paged_orders.items,
    'total', (select count(*) from filtered_orders),
    'fulfilment_counts', jsonb_build_object(
      'all', fulfilment_counts.all_count,
      'delivery', fulfilment_counts.delivery_count,
      'takeaway', fulfilment_counts.takeaway_count,
      'dine_in', fulfilment_counts.dine_in_count,
      'car_pickup', fulfilment_counts.car_pickup_count
    )
  )
  into result
  from fulfilment_counts
  cross join paged_orders;

  return result;
end;
$$;

revoke all on function public.get_admin_orders_page_v2(
  uuid, text, text, integer, integer, text
) from public, anon, authenticated;
grant execute on function public.get_admin_orders_page_v2(
  uuid, text, text, integer, integer, text
) to service_role;

notify pgrst, 'reload schema';
