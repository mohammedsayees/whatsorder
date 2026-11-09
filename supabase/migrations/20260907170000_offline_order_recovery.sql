begin;
set local lock_timeout = '5s';
-- Apply before deploying offline recovery changes. No financial history is rewritten.
create or replace function public.order_start_time(received timestamptz, punched timestamptz, source text)
returns timestamptz language sql immutable set search_path = '' as $$
  select case when source='staff' and punched <= received and punched >= received - interval '7 days'
    then punched else received end;
$$;
revoke all on function public.order_start_time(timestamptz,timestamptz,text) from public, anon, authenticated;
grant execute on function public.order_start_time(timestamptz,timestamptz,text) to service_role;

alter table public.orders add column if not exists origin_shift_id uuid;
alter table public.orders add column if not exists late_shift_entry boolean not null default false;
alter table public.orders add constraint orders_origin_shift_tenant_fk foreign key (origin_shift_id,restaurant_id)
  references public.restaurant_shifts(id,restaurant_id);
create index orders_late_shift_entries on public.orders(restaurant_id,shift_id,created_at) where late_shift_entry;

-- The same row lock used by shift closure prevents a live insert racing its snapshot.
-- Old clients' preselected shift_id is intentionally ignored. The stored punch time
-- chooses the historical shift, scoped to the authenticated action's restaurant.
create or replace function public.assign_staff_order_shift() returns trigger
language plpgsql set search_path = '' as $$
declare original_shift public.restaurant_shifts%rowtype; started timestamptz;
begin
  if new.source <> 'staff' or new.punched_at is null then return new; end if;
  started := public.order_start_time(new.created_at,new.punched_at,new.source);
  select * into original_shift from public.restaurant_shifts s
    where s.restaurant_id=new.restaurant_id and s.opened_at <= started
      and (s.closed_at is null or s.closed_at > started)
    order by s.opened_at desc limit 1 for update;
  new.origin_shift_id := original_shift.id;
  new.late_shift_entry := false;
  if original_shift.id is null then
    new.shift_id := null;
  elsif original_shift.status='open' then
    new.shift_id := original_shift.id;
  elsif new.status='Completed' and new.payment_method is not null then
    -- Payment was taken before closure. Keep it with that shift, never the next.
    -- Frozen close-report snapshots stay unchanged; the UI shows a late addendum.
    new.shift_id := original_shift.id;
    new.late_shift_entry := true;
  else
    -- No money was collected yet. Completion assigns the then-open cash shift.
    new.shift_id := null;
  end if;
  return new;
end;
$$;
revoke all on function public.assign_staff_order_shift() from public,anon,authenticated;
create trigger assign_staff_order_shift before insert on public.orders
for each row execute function public.assign_staff_order_shift();

drop trigger track_order_stage_clock on public.orders;
-- Repair initial-stage clocks only where no status transition was recorded.
-- Receipt timestamps and financial history remain unchanged.
update public.orders o set status_started_at=public.order_start_time(o.created_at,o.punched_at,o.source),
  closed_at=case when o.status in ('Completed','Cancelled')
    then public.order_start_time(o.created_at,o.punched_at,o.source) else o.closed_at end
where o.source='staff' and o.punched_at is not null and o.status_started_at=o.created_at
  and not exists(select 1 from public.order_status_events e where e.restaurant_id=o.restaurant_id
    and e.order_id=o.id and e.from_status is distinct from e.to_status);

create or replace function public.track_order_stage_clock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if TG_OP='INSERT' then
    new.status_started_at := public.order_start_time(new.created_at,new.punched_at,new.source);
    new.closed_at := case when new.status in ('Completed','Cancelled') then new.status_started_at end;
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
revoke all on function public.track_order_stage_clock() from public,anon,authenticated;
create trigger track_order_stage_clock before insert or update on public.orders
for each row execute function public.track_order_stage_clock();

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
      orders.created_at, orders.status_started_at, orders.closed_at, orders.source, orders.punched_at,
      public.order_start_time(orders.created_at, orders.punched_at, orders.source) as order_started_at,
      public.order_start_time(orders.created_at, orders.punched_at, orders.source) + make_interval(mins => coalesce((select (r.order_target_minutes ->> orders.fulfilment_type::text)::integer from public.restaurants r where r.id=target_restaurant_id), 30)) as due_at
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
          case when selected_status = 'active' then page_row.order_started_at end asc,
          case when selected_status <> 'active' then page_row.created_at end desc
      ),
      '[]'::jsonb
    ) as items
    from (
      select *
      from filtered_orders
      order by
        case when selected_status = 'active' and target_sort = 'overdue' then due_at end asc,
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

revoke all on function public.get_admin_orders_page_v2(uuid, text, text, integer, integer, text)
from public, anon, authenticated;

grant execute on function public.get_admin_orders_page_v2(uuid, text, text, integer, integer, text)
to service_role;

notify pgrst, 'reload schema';
commit;
