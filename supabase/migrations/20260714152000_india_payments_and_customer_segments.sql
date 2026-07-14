-- Complete India operations: preserve UPI totals in shift close snapshots and
-- apply country-appropriate customer value thresholds. All functions remain
-- tenant-scoped and service-role only.

alter table public.restaurant_shifts
  add column if not exists upi_total numeric(10, 2) not null default 0;

create or replace function public.calculate_restaurant_shift_summary(
  target_restaurant_id uuid,
  target_shift_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $shift_summary$
  with target_shift as (
    select *
    from public.restaurant_shifts
    where id = target_shift_id
      and restaurant_id = target_restaurant_id
  ),
  completed as (
    select
      count(*)::integer as completed_order_count,
      coalesce(sum(total), 0)::numeric(10, 2) as completed_sales,
      coalesce(
        sum(total) filter (where payment_method = 'Cash on Delivery'),
        0
      )::numeric(10, 2) as completed_cash_order_total,
      coalesce(
        sum(total) filter (where payment_method = 'Card on Delivery'),
        0
      )::numeric(10, 2) as card_on_delivery_total,
      coalesce(
        sum(total) filter (where payment_method = 'UPI'),
        0
      )::numeric(10, 2) as upi_total
    from public.orders
    where restaurant_id = target_restaurant_id
      and shift_id = target_shift_id
      and status = 'Completed'
  ),
  paid_outs as (
    select coalesce(sum(amount), 0)::numeric(10, 2) as cash_paid_out_total
    from public.shift_cash_paid_outs
    where restaurant_id = target_restaurant_id
      and shift_id = target_shift_id
  ),
  fulfilment as (
    select coalesce(
      jsonb_object_agg(
        fulfilment_type,
        jsonb_build_object('orders', order_count, 'sales', sales)
      ),
      '{}'::jsonb
    ) as breakdown
    from (
      select
        fulfilment_type,
        count(*)::integer as order_count,
        sum(total)::numeric(10, 2) as sales
      from public.orders
      where restaurant_id = target_restaurant_id
        and shift_id = target_shift_id
        and status = 'Completed'
      group by fulfilment_type
    ) values_by_fulfilment
  ),
  cancelled as (
    select count(distinct event.order_id)::integer as cancelled_order_count
    from public.order_status_events event
    cross join target_shift shift
    where event.restaurant_id = target_restaurant_id
      and event.to_status = 'Cancelled'
      and event.created_at >= shift.opened_at
      and event.created_at <= coalesce(shift.closed_at, now())
  )
  select jsonb_build_object(
    'completed_order_count', completed.completed_order_count,
    'completed_sales', completed.completed_sales,
    'completed_cash_order_total', completed.completed_cash_order_total,
    'card_on_delivery_total', completed.card_on_delivery_total,
    'upi_total', completed.upi_total,
    'cash_paid_out_total', paid_outs.cash_paid_out_total,
    'cancelled_order_count', cancelled.cancelled_order_count,
    'fulfilment_breakdown', fulfilment.breakdown,
    'expected_cash_amount',
      (
        shift.opening_cash_amount
        + completed.completed_cash_order_total
        - paid_outs.cash_paid_out_total
      )::numeric(10, 2)
  )
  from target_shift shift
  cross join completed
  cross join paid_outs
  cross join fulfilment
  cross join cancelled;
$shift_summary$;

create or replace function public.close_restaurant_shift(
  target_restaurant_id uuid,
  target_shift_id uuid,
  requested_cash_counted_amount numeric,
  requested_closing_note text,
  event_actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $close_shift$
declare
  actor_role text;
  shift_opener uuid;
  summary jsonb;
  expected_cash numeric(10, 2);
  difference numeric(10, 2);
begin
  actor_role := public.shift_actor_role(
    target_restaurant_id,
    event_actor_user_id
  );

  select opened_by_user_id
  into shift_opener
  from public.restaurant_shifts
  where id = target_shift_id
    and restaurant_id = target_restaurant_id
    and status = 'open'
  for update;

  if not found then
    raise exception 'Open shift not found';
  end if;

  if actor_role is null
     or (actor_role = 'staff' and shift_opener <> event_actor_user_id) then
    raise exception 'Only the shift opener or restaurant management can close this shift';
  end if;

  if requested_cash_counted_amount is null
     or requested_cash_counted_amount < 0 then
    raise exception 'Counted cash cannot be negative';
  end if;

  if exists (
    select 1
    from public.orders
    where restaurant_id = target_restaurant_id
      and status in (
        'New',
        'Accepted',
        'Preparing',
        'Ready to Serve',
        'Out for Delivery'
      )
  ) then
    raise exception 'Cannot close shift while active orders remain';
  end if;

  summary := public.calculate_restaurant_shift_summary(
    target_restaurant_id,
    target_shift_id
  );
  expected_cash := (summary->>'expected_cash_amount')::numeric(10, 2);
  difference := round(requested_cash_counted_amount, 2) - expected_cash;

  if difference <> 0
     and nullif(trim(requested_closing_note), '') is null then
    raise exception 'A closing note is required when cash has a difference';
  end if;

  update public.restaurant_shifts
  set
    status = 'closed',
    cash_counted_amount = round(requested_cash_counted_amount, 2),
    expected_cash_amount = expected_cash,
    difference_amount = difference,
    completed_order_count = (summary->>'completed_order_count')::integer,
    completed_sales = (summary->>'completed_sales')::numeric(10, 2),
    completed_cash_order_total =
      (summary->>'completed_cash_order_total')::numeric(10, 2),
    card_on_delivery_total =
      (summary->>'card_on_delivery_total')::numeric(10, 2),
    upi_total = (summary->>'upi_total')::numeric(10, 2),
    cash_paid_out_total =
      (summary->>'cash_paid_out_total')::numeric(10, 2),
    cancelled_order_count = (summary->>'cancelled_order_count')::integer,
    fulfilment_breakdown = summary->'fulfilment_breakdown',
    closing_note = nullif(left(trim(requested_closing_note), 500), ''),
    closed_by_user_id = event_actor_user_id,
    closed_at = now()
  where id = target_shift_id
    and restaurant_id = target_restaurant_id
    and status = 'open';

  return target_shift_id;
end;
$close_shift$;

create or replace function public.get_customer_segment_page(
  p_restaurant_id uuid,
  p_segment text default 'all',
  p_search text default null,
  p_page int default 1,
  p_page_size int default 25
)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
with tenant as (
  select
    time_zone,
    case country_code when 'IN' then 10000::numeric else 250::numeric end
      as vip_spend_threshold,
    case country_code when 'IN' then 1000::numeric else 60::numeric end
      as high_aov_threshold
  from public.restaurants
  where id = p_restaurant_id
),
params as (
  select
    greatest(coalesce(p_page, 1), 1) as page,
    least(greatest(coalesce(p_page_size, 25), 1), 100) as page_size,
    nullif(btrim(coalesce(p_search, '')), '') as search,
    coalesce(nullif(btrim(p_segment), ''), 'all') as segment,
    now() as now_ts,
    tenant.time_zone,
    tenant.vip_spend_threshold,
    tenant.high_aov_threshold
  from tenant
),
order_facts as (
  select
    o.customer_phone,
    count(*) as completed_count,
    count(*) filter (
      where extract(hour from o.created_at at time zone (select time_zone from params)) >= 4
        and extract(hour from o.created_at at time zone (select time_zone from params)) < 10
    ) as morning_count,
    count(*) filter (
      where extract(hour from o.created_at at time zone (select time_zone from params)) >= 0
        and extract(hour from o.created_at at time zone (select time_zone from params)) < 4
    ) as midnight_count,
    bool_or(
      exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(o.items::jsonb) = 'array'
            then o.items::jsonb else '[]'::jsonb end
        ) e
        where lower(e->>'name') like '%karak%'
      )
    ) as buys_karak,
    bool_or(
      exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(o.items::jsonb) = 'array'
            then o.items::jsonb else '[]'::jsonb end
        ) e
        where lower(e->>'name') like '%burger%'
      )
    ) as buys_burger
  from public.orders o
  where o.restaurant_id = p_restaurant_id
    and o.status = 'Completed'
  group by o.customer_phone
),
pref as (
  select distinct on (customer_phone) customer_phone, fulfilment_type
  from (
    select o.customer_phone, o.fulfilment_type,
           count(*) as c, max(o.created_at) as mx
    from public.orders o
    where o.restaurant_id = p_restaurant_id and o.status = 'Completed'
    group by o.customer_phone, o.fulfilment_type
  ) g
  order by customer_phone, c desc, mx desc
),
base as (
  select
    c.*,
    case
      when c.last_order_at is not null
       and (select now_ts from params) - c.last_order_at >= interval '30 days'
        then 'Inactive'
      when coalesce(c.total_orders, 0) >= 5
        or coalesce(c.total_spend, 0) >= (select vip_spend_threshold from params)
        then 'VIP'
      when coalesce(c.total_orders, 0) >= 2 then 'Repeat'
      else 'New'
    end as lifecycle,
    (c.marketing_opt_in and c.consent_marketing
      and c.marketing_consent_withdrawn_at is null) as contactable,
    case
      when coalesce(c.total_orders, 0) > 0
        then (coalesce(c.total_spend, 0) / c.total_orders)
          >= (select high_aov_threshold from params)
      else false
    end as high_aov,
    coalesce(f.completed_count, 0) as fact_completed,
    coalesce(f.morning_count, 0) as morning_count,
    coalesce(f.midnight_count, 0) as midnight_count,
    coalesce(f.buys_karak, false) as buys_karak,
    coalesce(f.buys_burger, false) as buys_burger,
    p.fulfilment_type as preferred_fulfilment
  from public.customers c
  left join order_facts f on f.customer_phone = c.phone
  left join pref p on p.customer_phone = c.phone
  where c.restaurant_id = p_restaurant_id
),
filtered as (
  select b.*
  from base b, params
  where
    (params.search is null
      or b.name ilike '%' || params.search || '%'
      or b.phone ilike '%' || params.search || '%')
    and case params.segment
      when 'all' then true
      when 'new' then b.lifecycle = 'New'
      when 'repeat' then b.lifecycle = 'Repeat'
      when 'vip' then b.lifecycle = 'VIP'
      when 'inactive' then b.lifecycle = 'Inactive'
      when 'marketing_opt_in' then b.contactable
      when 'no_consent' then not b.contactable
      when 'high_aov' then b.high_aov
      when 'delivery' then b.preferred_fulfilment = 'delivery'
      when 'takeaway' then b.preferred_fulfilment = 'takeaway'
      when 'car_pickup' then b.preferred_fulfilment = 'car_pickup'
      when 'dine_in' then b.preferred_fulfilment = 'dine_in'
      when 'morning' then b.fact_completed >= 2
        and b.morning_count * 2 >= b.fact_completed
      when 'midnight' then b.fact_completed >= 2
        and b.midnight_count * 2 >= b.fact_completed
      when 'karak_buyers' then b.buys_karak
      when 'burger_buyers' then b.buys_burger
      else true
    end
)
select jsonb_build_object(
  'summary', (
    select jsonb_build_object(
      'total', count(*),
      'repeat', count(*) filter (where lifecycle = 'Repeat'),
      'vip', count(*) filter (where lifecycle = 'VIP'),
      'inactive', count(*) filter (where lifecycle = 'Inactive'),
      'marketing_opt_in', count(*) filter (where contactable)
    )
    from base
  ),
  'matched', (select count(*) from filtered),
  'contactable_matched',
    (select count(*) filter (where contactable) from filtered),
  'pagination', jsonb_build_object(
    'page', (select page from params),
    'page_size', (select page_size from params),
    'total_pages',
      ceil((select count(*) from filtered)::numeric
        / (select page_size from params))::int
  ),
  'items', (
    select coalesce(
      jsonb_agg(to_jsonb(t) order by t.updated_at desc),
      '[]'::jsonb
    )
    from (
      select f.*
      from filtered f
      order by f.updated_at desc
      limit (select page_size from params)
      offset ((select page from params) - 1) * (select page_size from params)
    ) t
  )
);
$function$;

revoke all on function public.calculate_restaurant_shift_summary(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.calculate_restaurant_shift_summary(uuid, uuid)
to service_role;

revoke all on function public.close_restaurant_shift(uuid, uuid, numeric, text, uuid)
from public, anon, authenticated;
grant execute on function public.close_restaurant_shift(uuid, uuid, numeric, text, uuid)
to service_role;

revoke all on function public.get_customer_segment_page(uuid, text, text, int, int)
from public, anon, authenticated;
grant execute on function public.get_customer_segment_page(uuid, text, text, int, int)
to service_role;

notify pgrst, 'reload schema';
