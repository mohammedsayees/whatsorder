-- POS order discounts (phase 1: staff-applied, order level).
--
-- Staff can discount a whole order by a percentage or a fixed amount, with a
-- reason, either when punching it or before collecting payment. The discount
-- applies to the subtotal only (never the delivery fee) and stacks on top of
-- item offer prices. Owners/managers are unlimited; the `staff` role is
-- capped by restaurants.staff_discount_max_percent (default 10%).
--
-- Additive and backward compatible: every existing order keeps
-- discount_amount = 0 and the constraints below only bind discounted rows.

begin;

alter table public.restaurants
  add column if not exists staff_discount_max_percent numeric(5, 2) not null default 10;

alter table public.orders
  add column if not exists discount_amount numeric(10, 2) not null default 0,
  add column if not exists discount_type text,
  add column if not exists discount_value numeric(10, 2),
  add column if not exists discount_reason text,
  add column if not exists discounted_by uuid references auth.users(id) on delete set null,
  add column if not exists discounted_at timestamptz;

do $discount_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.restaurants'::regclass
      and conname = 'restaurants_staff_discount_max_percent_range'
  ) then
    alter table public.restaurants
      add constraint restaurants_staff_discount_max_percent_range
      check (staff_discount_max_percent between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'orders_discount_shape'
  ) then
    alter table public.orders
      add constraint orders_discount_shape
      check (
        (
          discount_type is null
          and discount_value is null
          and discount_amount = 0
        )
        or (
          discount_type in ('percent', 'fixed')
          and discount_value > 0
          and (discount_type <> 'percent' or discount_value <= 100)
          and discount_amount > 0
          and discount_amount <= subtotal
          and nullif(btrim(discount_reason), '') is not null
          and char_length(discount_reason) <= 200
        )
      );
  end if;

  -- The total of a discounted order must always reconcile, whichever code
  -- path wrote it. Undiscounted (legacy) rows are deliberately not checked.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.orders'::regclass and conname = 'orders_discount_total_reconciles'
  ) then
    alter table public.orders
      add constraint orders_discount_total_reconciles
      check (
        discount_amount = 0
        or total = subtotal - discount_amount - loyalty_discount + delivery_fee
      );
  end if;
end
$discount_constraints$;

-- Audit trail: every discount added, changed or removed, from any path.
create table if not exists public.order_discount_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null,
  order_subtotal numeric(10, 2) not null,
  previous_amount numeric(10, 2) not null default 0,
  discount_type text,
  discount_value numeric(10, 2),
  discount_amount numeric(10, 2) not null default 0,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint order_discount_event_order_tenant_fkey
    foreign key (order_id, restaurant_id)
    references public.orders(id, restaurant_id)
    on delete cascade
);

create index if not exists idx_order_discount_events_restaurant_created
on public.order_discount_events(restaurant_id, created_at desc);

create index if not exists idx_order_discount_events_order
on public.order_discount_events(restaurant_id, order_id, created_at desc);

alter table public.order_discount_events enable row level security;

drop policy if exists "Tenant members can read order discount events"
on public.order_discount_events;

create policy "Tenant members can read order discount events"
on public.order_discount_events
for select
using (
  public.is_restaurant_member(restaurant_id)
  or public.is_super_admin()
);

revoke all on table public.order_discount_events from anon, authenticated;
grant select on table public.order_discount_events to authenticated;

create or replace function public.log_order_discount_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $log_discount$
begin
  if tg_op = 'INSERT' then
    if new.discount_amount = 0 then
      return new;
    end if;
  elsif new.discount_type is not distinct from old.discount_type
    and new.discount_value is not distinct from old.discount_value
    and new.discount_amount is not distinct from old.discount_amount
    and new.discount_reason is not distinct from old.discount_reason then
    return new;
  end if;

  insert into public.order_discount_events (
    restaurant_id, order_id, order_subtotal, previous_amount,
    discount_type, discount_value, discount_amount, reason, actor_user_id
  ) values (
    new.restaurant_id,
    new.id,
    new.subtotal,
    case when tg_op = 'UPDATE' then old.discount_amount else 0 end,
    new.discount_type,
    new.discount_value,
    new.discount_amount,
    new.discount_reason,
    new.discounted_by
  );

  return new;
end
$log_discount$;

revoke all on function public.log_order_discount_change() from public, anon, authenticated;

drop trigger if exists orders_log_discount_change on public.orders;
create trigger orders_log_discount_change
after insert or update of discount_type, discount_value, discount_amount, discount_reason
on public.orders
for each row execute function public.log_order_discount_change();

-- A percentage discount would silently drift if items were added or removed
-- underneath it (add_items/reduce_items adjust total by the item delta only).
-- Until those flows recalculate discounts, staff remove the discount first.
create or replace function public.guard_discounted_order_items()
returns trigger
language plpgsql
set search_path = public
as $guard_discount_items$
begin
  if old.discount_amount > 0
     and new.discount_amount > 0
     and (new.items is distinct from old.items or new.subtotal is distinct from old.subtotal) then
    raise exception 'Remove the discount before changing items';
  end if;

  return new;
end
$guard_discount_items$;

revoke all on function public.guard_discounted_order_items() from public, anon, authenticated;

drop trigger if exists orders_guard_discounted_items on public.orders;
create trigger orders_guard_discounted_items
before update of items, subtotal on public.orders
for each row execute function public.guard_discounted_order_items();

-- Apply, change or remove (requested_type null) a discount on an open,
-- unpaid order. Service-role only; the server action passes the session's
-- role so the staff cap is enforced in the same transaction as the write.
create or replace function public.apply_order_discount(
  target_restaurant_id uuid,
  target_order_id uuid,
  requested_type text,
  requested_value numeric,
  requested_reason text,
  event_actor_user_id uuid,
  event_actor_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $apply_discount$
declare
  saved_order public.orders%rowtype;
  staff_limit numeric;
  new_amount numeric(10, 2);
  clean_reason text := left(btrim(coalesce(requested_reason, '')), 200);
begin
  if target_restaurant_id is null or target_order_id is null then
    raise exception 'Order not found';
  end if;

  select * into saved_order
  from public.orders
  where id = target_order_id
    and restaurant_id = target_restaurant_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if saved_order.status in ('Completed', 'Cancelled') then
    raise exception 'Completed or cancelled orders cannot be discounted';
  end if;

  if saved_order.payment_method is not null then
    raise exception 'Paid orders cannot be discounted';
  end if;

  if saved_order.online_payment_status is not null then
    raise exception 'Orders with an online payment cannot be discounted';
  end if;

  if coalesce(saved_order.loyalty_discount, 0) > 0
     or coalesce(saved_order.points_redeemed, 0) > 0 then
    raise exception 'Orders with loyalty activity cannot be discounted';
  end if;

  if requested_type is null then
    if saved_order.discount_amount = 0 then
      return to_jsonb(saved_order);
    end if;

    update public.orders
    set discount_type = null,
        discount_value = null,
        discount_amount = 0,
        discount_reason = null,
        discounted_by = event_actor_user_id,
        discounted_at = now(),
        total = subtotal - loyalty_discount + delivery_fee,
        updated_at = now()
    where id = target_order_id
      and restaurant_id = target_restaurant_id
    returning * into saved_order;

    return to_jsonb(saved_order);
  end if;

  if requested_type not in ('percent', 'fixed')
     or requested_value is null
     or requested_value <= 0
     or (requested_type = 'percent' and requested_value > 100) then
    raise exception 'Enter a valid discount';
  end if;

  if clean_reason = '' then
    raise exception 'A discount reason is required';
  end if;

  new_amount := case
    when requested_type = 'percent' then round(saved_order.subtotal * requested_value / 100, 2)
    else round(least(requested_value, saved_order.subtotal), 2)
  end;

  if new_amount <= 0 then
    raise exception 'Enter a valid discount';
  end if;

  if event_actor_role = 'staff' then
    select coalesce(staff_discount_max_percent, 10) into staff_limit
    from public.restaurants
    where id = target_restaurant_id;

    if new_amount > round(saved_order.subtotal * coalesce(staff_limit, 10) / 100, 2) then
      raise exception 'Discount exceeds the staff limit';
    end if;
  end if;

  update public.orders
  set discount_type = requested_type,
      discount_value = round(requested_value, 2),
      discount_amount = new_amount,
      discount_reason = clean_reason,
      discounted_by = event_actor_user_id,
      discounted_at = now(),
      total = subtotal - new_amount - loyalty_discount + delivery_fee,
      updated_at = now()
  where id = target_order_id
    and restaurant_id = target_restaurant_id
  returning * into saved_order;

  return to_jsonb(saved_order);
end;
$apply_discount$;

revoke all on function public.apply_order_discount(
  uuid, uuid, text, numeric, text, uuid, text
) from public, anon, authenticated;

grant execute on function public.apply_order_discount(
  uuid, uuid, text, numeric, text, uuid, text
) to service_role;

-- Order queue: same signature as before, now also returns the discount
-- fields (and online_payment_status) so cards can show and edit discounts.
create or replace function public.get_admin_orders_page_v4(
  target_restaurant_id uuid,
  target_status_view text default 'active',
  target_fulfilment text default 'all',
  target_page integer default 1,
  target_page_size integer default 25,
  target_sort text default 'oldest',
  target_search text default null,
  target_source text default 'all'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_status text := lower(coalesce(target_status_view, 'active'));
  selected_fulfilment text := lower(coalesce(target_fulfilment, 'all'));
  selected_source text := lower(coalesce(target_source, 'all'));
  normalized_search text := lower(trim(leading '#' from trim(coalesce(target_search, ''))));
  safe_page integer := greatest(1, coalesce(target_page, 1));
  safe_page_size integer := least(100, greatest(1, coalesce(target_page_size, 25)));
  result jsonb;
begin
  if target_restaurant_id is null then
    raise exception 'Restaurant id is required.' using errcode = '22023';
  end if;

  if selected_status not in (
    'active', 'new', 'preparing', 'ready', 'out_for_delivery',
    'completed', 'cancelled'
  ) then
    raise exception 'Invalid order status view.' using errcode = '22023';
  end if;

  if selected_fulfilment not in (
    'all', 'delivery', 'takeaway', 'dine_in', 'car_pickup'
  ) then
    raise exception 'Invalid fulfilment view.' using errcode = '22023';
  end if;

  if selected_source not in ('all', 'customer', 'staff', 'whatsapp_chat') then
    raise exception 'Invalid order source view.' using errcode = '22023';
  end if;

  with searched_orders as materialized (
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
      orders.discount_amount,
      orders.discount_type,
      orders.discount_value,
      orders.discount_reason,
      orders.online_payment_status,
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
      and (selected_source = 'all' or orders.source = selected_source)
      and (
        normalized_search = ''
        or position(normalized_search in lower(orders.id::text)) > 0
        or position(normalized_search in lower(coalesce(orders.customer_name, ''))) > 0
        or position(normalized_search in lower(coalesce(orders.customer_phone, ''))) > 0
      )
  ),
  status_counts as (
    select
      count(*) filter (where status in (
        'New', 'Accepted', 'Preparing', 'Ready to Serve', 'Out for Delivery'
      )) as active_count,
      count(*) filter (where status = 'New') as new_count,
      count(*) filter (where status in ('Accepted', 'Preparing')) as preparing_count,
      count(*) filter (where status = 'Ready to Serve') as ready_count,
      count(*) filter (where status = 'Out for Delivery') as out_for_delivery_count,
      count(*) filter (where status = 'Completed') as completed_count,
      count(*) filter (where status = 'Cancelled') as cancelled_count
    from searched_orders
  ),
  status_orders as materialized (
    select *
    from searched_orders
    where case selected_status
      when 'active' then status in (
        'New', 'Accepted', 'Preparing', 'Ready to Serve', 'Out for Delivery'
      )
      when 'new' then status = 'New'
      when 'preparing' then status in ('Accepted', 'Preparing')
      when 'ready' then status = 'Ready to Serve'
      when 'out_for_delivery' then status = 'Out for Delivery'
      when 'completed' then status = 'Completed'
      else status = 'Cancelled'
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
          case when selected_status not in ('completed', 'cancelled')
              and target_sort = 'overdue' then page_row.due_at end asc,
          case when selected_status not in ('completed', 'cancelled')
            then page_row.order_started_at end asc,
          case when selected_status in ('completed', 'cancelled')
            then page_row.created_at end desc
      ),
      '[]'::jsonb
    ) as items
    from (
      select *
      from filtered_orders
      order by
        case when selected_status not in ('completed', 'cancelled')
            and target_sort = 'overdue' then due_at end asc,
        case when selected_status not in ('completed', 'cancelled')
          then order_started_at end asc,
        case when selected_status in ('completed', 'cancelled')
          then created_at end desc
      limit safe_page_size
      offset (safe_page - 1) * safe_page_size
    ) as page_row
  )
  select jsonb_build_object(
    'items', paged_orders.items,
    'total', (select count(*) from filtered_orders),
    'status_counts', jsonb_build_object(
      'active', status_counts.active_count,
      'new', status_counts.new_count,
      'preparing', status_counts.preparing_count,
      'ready', status_counts.ready_count,
      'out_for_delivery', status_counts.out_for_delivery_count,
      'completed', status_counts.completed_count,
      'cancelled', status_counts.cancelled_count
    ),
    'fulfilment_counts', jsonb_build_object(
      'all', fulfilment_counts.all_count,
      'delivery', fulfilment_counts.delivery_count,
      'takeaway', fulfilment_counts.takeaway_count,
      'dine_in', fulfilment_counts.dine_in_count,
      'car_pickup', fulfilment_counts.car_pickup_count
    )
  )
  into result
  from status_counts
  cross join fulfilment_counts
  cross join paged_orders;

  return result;
end;
$$;

revoke all on function public.get_admin_orders_page_v4(
  uuid, text, text, integer, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.get_admin_orders_page_v4(
  uuid, text, text, integer, integer, text, text, text
) to service_role;

do $verify_admin_orders_page_v4$
begin
  if has_function_privilege('anon', 'public.get_admin_orders_page_v4(uuid, text, text, integer, integer, text, text, text)', 'execute')
    or has_function_privilege('authenticated', 'public.get_admin_orders_page_v4(uuid, text, text, integer, integer, text, text, text)', 'execute') then
    raise exception 'get_admin_orders_page_v4 must stay service-role only';
  end if;
end;
$verify_admin_orders_page_v4$;

notify pgrst, 'reload schema';
commit;
