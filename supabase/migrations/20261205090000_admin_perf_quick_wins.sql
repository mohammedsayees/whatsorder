-- Admin performance quick wins (no behaviour change).
--
-- 1. get_admin_orders_page_v4: same signature, same JSON output.
--    Before: every call copied every column of every order for the tenant
--    (including the large `items` jsonb) into a materialized CTE, and ran a
--    correlated sub-select on public.restaurants once per order row to read
--    order_target_minutes. With ~9.3k orders that was ~245 ms warm (467 ms
--    mean in pg_stat_statements), spilled to temp files, and accounted for
--    millions of sequential scans on public.restaurants.
--    After: order_target_minutes is read once; the order start time is
--    computed inline once per row (see below); counts, filtering, sorting
--    and paging run over narrow rows; full order columns are fetched only
--    for the (at most 100) rows on the requested page. A final `id`
--    tiebreak makes OFFSET paging stable when two orders share a start time.
--    Verified on production data before writing this file: identical JSON
--    for 256 parameter combinations; ~240 ms -> ~34 ms per call.
--
-- 2. Partial index for the new-order alert's "recently paid online" lookup
--    (src/lib/data.ts getRecentOnlinePayments), which currently scans the
--    whole orders table on every alert reconcile.
--
-- 3. Two SELECT policies re-evaluated auth.uid() for every row
--    (Supabase advisor: auth_rls_initplan). Wrapping it in a scalar
--    sub-select lets Postgres evaluate it once per statement. The access
--    rules are otherwise copied verbatim and are unchanged.

-- 1 ------------------------------------------------------------------------
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
set search_path to ''
as $function$
declare
  selected_status text := lower(coalesce(target_status_view, 'active'));
  selected_fulfilment text := lower(coalesce(target_fulfilment, 'all'));
  selected_source text := lower(coalesce(target_source, 'all'));
  normalized_search text := lower(trim(leading '#' from trim(coalesce(target_search, ''))));
  safe_page integer := greatest(1, coalesce(target_page, 1));
  safe_page_size integer := least(100, greatest(1, coalesce(target_page_size, 25)));
  target_minutes jsonb;
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

  -- Read once instead of once per order row.
  select restaurant.order_target_minutes
  into target_minutes
  from public.restaurants restaurant
  where restaurant.id = target_restaurant_id;

  with searched_orders as materialized (
    -- Narrow rows only: everything needed to count, filter, sort and page.
    select
      orders.id,
      orders.status,
      orders.fulfilment_type,
      orders.created_at,
      started.order_started_at,
      started.order_started_at + make_interval(
        mins => coalesce(
          (target_minutes ->> orders.fulfilment_type::text)::integer,
          30
        )
      ) as due_at
    from public.orders
    -- Inlined copy of public.order_start_time(created_at, punched_at, source).
    -- That function sets search_path, which stops Postgres inlining it, so
    -- calling it twice per order row was most of this function's cost.
    -- The verification block at the end of this migration fails the
    -- migration if the two ever disagree.
    cross join lateral (
      select case
        when orders.source = 'staff'
          and orders.punched_at <= orders.created_at
          and orders.punched_at >= orders.created_at - interval '7 days'
        then orders.punched_at
        else orders.created_at
      end as order_started_at
    ) started
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
  page_keys as (
    select
      filtered_orders.id,
      filtered_orders.order_started_at,
      filtered_orders.due_at,
      filtered_orders.created_at
    from filtered_orders
    order by
      case when selected_status not in ('completed', 'cancelled')
          and target_sort = 'overdue' then due_at end asc,
      case when selected_status not in ('completed', 'cancelled')
        then order_started_at end asc,
      case when selected_status in ('completed', 'cancelled')
        then created_at end desc,
      id
    limit safe_page_size
    offset (safe_page - 1) * safe_page_size
  ),
  page_rows as (
    -- Full columns for the current page only. Column set matches v4's
    -- original output exactly (the JSON keys the dashboard reads).
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
      orders.promo_code,
      orders.online_payment_status,
      orders.status,
      orders.created_at,
      orders.status_started_at,
      orders.closed_at,
      orders.source,
      orders.punched_at,
      page_keys.order_started_at,
      page_keys.due_at
    from page_keys
    join public.orders
      on orders.id = page_keys.id
     and orders.restaurant_id = target_restaurant_id
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
            then page_row.created_at end desc,
          page_row.id
      ),
      '[]'::jsonb
    ) as items
    from page_rows as page_row
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
$function$;

-- create or replace keeps existing grants; restate them so this file is
-- self-contained (matches 20261127090000_promo_codes.sql).
revoke all on function public.get_admin_orders_page_v4(
  uuid, text, text, integer, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public.get_admin_orders_page_v4(
  uuid, text, text, integer, integer, text, text, text
) to service_role;

-- The inlined start-time expression above must stay identical to
-- public.order_start_time. Check every existing order plus edge cases.
do $verify_order_start_time_inline$
declare
  mismatches integer;
begin
  select count(*)
  into mismatches
  from (
    select created_at, punched_at, source from public.orders
    union all
    select * from (values
      (now(), now() - interval '1 hour', 'staff'),
      (now(), now() - interval '7 days', 'staff'),
      (now(), now() - interval '8 days', 'staff'),
      (now(), now() + interval '1 minute', 'staff'),
      (now(), null::timestamptz, 'staff'),
      (now(), now() - interval '1 hour', 'customer')
    ) as edge(created_at, punched_at, source)
  ) sample
  where public.order_start_time(sample.created_at, sample.punched_at, sample.source)
    is distinct from (
      case
        when sample.source = 'staff'
          and sample.punched_at <= sample.created_at
          and sample.punched_at >= sample.created_at - interval '7 days'
        then sample.punched_at
        else sample.created_at
      end
    );

  if mismatches > 0 then
    raise exception 'get_admin_orders_page_v4 inline start time disagrees with order_start_time (% rows)', mismatches;
  end if;
end;
$verify_order_start_time_inline$;

-- 2 ------------------------------------------------------------------------
create index if not exists idx_orders_restaurant_online_paid
  on public.orders (restaurant_id, online_paid_at)
  where online_payment_status = 'paid';

-- 3 ------------------------------------------------------------------------
alter policy "Read shift close reports (managers all, staff own)"
on public.shift_close_reports
using (
  public.is_super_admin()
  or public.is_restaurant_member(
    shift_close_reports.restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
  or (
    public.is_restaurant_member(
      shift_close_reports.restaurant_id,
      array['staff']
    )
    and exists (
      select 1
      from public.restaurant_shifts shift
      where shift.id = shift_close_reports.shift_id
        and shift.restaurant_id = shift_close_reports.restaurant_id
        and shift.opened_by_user_id = (select auth.uid())
    )
  )
);

alter policy "Restaurant staff can read current and own other income"
on public.shift_other_income_entries
using (
  public.is_restaurant_member(
    shift_other_income_entries.restaurant_id,
    array['staff']
  )
  and exists (
    select 1 from public.restaurant_shifts shift
    where shift.id = shift_other_income_entries.shift_id
      and shift.restaurant_id = shift_other_income_entries.restaurant_id
      and (shift.status = 'open' or shift.opened_by_user_id = (select auth.uid()))
  )
);
