-- Migration-first: defaults preserve existing menu visibility and old clients.
alter table public.menu_items add column if not exists staff_only boolean not null default false;
alter table public.menu_items add column if not exists quick_created_by uuid;

-- Restrictive policies intersect existing read policies; no new write access.
create policy "Hide staff products from anonymous customers" on public.menu_items
as restrictive for select to anon using (not staff_only);
create policy "Staff products require tenant membership" on public.menu_items
as restrictive for select to authenticated using (
  not staff_only or public.is_restaurant_member(restaurant_id) or public.is_super_admin()
);

alter table public.restaurants add column if not exists order_target_minutes jsonb not null
default '{"delivery":45,"takeaway":20,"dine_in":30,"car_pickup":20}'::jsonb;

alter table public.orders add column if not exists status_started_at timestamptz;
alter table public.orders add column if not exists closed_at timestamptz;

-- Use actual status events for historical orders. Unknown terminal timings stay
-- unknown rather than treating a later payment/edit timestamp as completion.
update public.orders o set
  status_started_at = coalesce((select max(e.created_at) from public.order_status_events e
    where e.order_id=o.id and e.restaurant_id=o.restaurant_id and e.to_status=o.status
      and e.from_status is distinct from e.to_status), case when o.status='New' then o.created_at end),
  closed_at = case when o.status in ('Completed','Cancelled') then
    (select max(e.created_at) from public.order_status_events e
      where e.order_id=o.id and e.restaurant_id=o.restaurant_id and e.to_status=o.status
        and e.from_status is distinct from e.to_status) end;

create or replace function public.track_order_stage_clock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if TG_OP='INSERT' then
    -- Staff offline submissions preserve punched_at in created_at; draft time
    -- is excluded because punched_at is generated only on submission.
    new.status_started_at := new.created_at;
    new.closed_at := case when new.status in ('Completed','Cancelled') then new.created_at end;
  elsif new.status is distinct from old.status then
    new.status_started_at := clock_timestamp();
    new.closed_at := case when new.status in ('Completed','Cancelled') then new.status_started_at end;
  else
    new.status_started_at := old.status_started_at;
    new.closed_at := old.closed_at;
  end if;
  return new;
end;
$$;
revoke all on function public.track_order_stage_clock() from public, anon, authenticated;
create trigger track_order_stage_clock before insert or update on public.orders
for each row execute function public.track_order_stage_clock();

-- Collapse the admin order page and its five fulfilment badge counts into one
-- tenant-scoped database round trip. Only the service role may execute this
-- operational read; browser roles keep their existing read-only RLS surface.

create or replace function public.get_admin_orders_page_v2(
  target_restaurant_id uuid,
  target_status_view text default 'active',
  target_fulfilment text default 'all',
  target_page integer default 1,
  target_page_size integer default 25, target_sort text default 'oldest'
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
      orders.created_at, orders.status_started_at, orders.closed_at,
      orders.created_at + make_interval(mins => coalesce((select (r.order_target_minutes ->> orders.fulfilment_type::text)::integer from public.restaurants r where r.id=target_restaurant_id), 30)) as due_at
    from public.orders
    where orders.restaurant_id = target_restaurant_id
      and case selected_status
        when 'active' then orders.status in (
          'New',
          'Accepted',
          'Preparing',
          'Ready to Serve',
          'Out for Delivery'
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
          case when selected_status = 'active' and target_sort = 'overdue' then page_row.due_at end asc,
          case when selected_status = 'active' then page_row.created_at end asc,
          case when selected_status <> 'active' then page_row.created_at end desc
      ),
      '[]'::jsonb
    ) as items
    from (
      select *
      from filtered_orders
      order by
        case when selected_status = 'active' and target_sort = 'overdue' then due_at end asc,
        case when selected_status = 'active' then created_at end asc,
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

revoke all on function public.get_admin_orders_page_v2(uuid, text, text, integer, integer, text)
from public, anon, authenticated;

grant execute on function public.get_admin_orders_page_v2(uuid, text, text, integer, integer, text)
to service_role;
