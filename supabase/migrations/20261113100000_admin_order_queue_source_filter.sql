-- Staff order queue v4: v3 plus an order-source filter (menu link, staff, WhatsApp chat).
-- Additive: v3 stays in place so the previous app build keeps working during deploy.
-- The source filter applies before counting, like search, so tab counts match the view.
begin;

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
