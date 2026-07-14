-- Phase 1.5 — campaign-ready customer segments.
create index if not exists orders_restaurant_status_phone_idx
  on public.orders (restaurant_id, status, customer_phone);

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
with params as (
  select
    greatest(coalesce(p_page, 1), 1) as page,
    least(greatest(coalesce(p_page_size, 25), 1), 100) as page_size,
    nullif(btrim(coalesce(p_search, '')), '') as search,
    coalesce(nullif(btrim(p_segment), ''), 'all') as segment,
    now() as now_ts
),
order_facts as (
  select
    o.customer_phone,
    count(*) as completed_count,
    count(*) filter (
      where extract(hour from o.created_at at time zone 'Asia/Dubai') >= 4
        and extract(hour from o.created_at at time zone 'Asia/Dubai') < 10
    ) as morning_count,
    count(*) filter (
      where extract(hour from o.created_at at time zone 'Asia/Dubai') >= 0
        and extract(hour from o.created_at at time zone 'Asia/Dubai') < 4
    ) as midnight_count,
    bool_or(
      exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(o.items::jsonb) = 'array' then o.items::jsonb else '[]'::jsonb end
        ) e
        where lower(e->>'name') like '%karak%'
      )
    ) as buys_karak,
    bool_or(
      exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(o.items::jsonb) = 'array' then o.items::jsonb else '[]'::jsonb end
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
       and (select now_ts from params) - c.last_order_at >= interval '30 days' then 'Inactive'
      when coalesce(c.total_orders, 0) >= 5 or coalesce(c.total_spend, 0) >= 250 then 'VIP'
      when coalesce(c.total_orders, 0) >= 2 then 'Repeat'
      else 'New'
    end as lifecycle,
    (c.marketing_opt_in and c.consent_marketing and c.marketing_consent_withdrawn_at is null)
      as contactable,
    case
      when coalesce(c.total_orders, 0) > 0
        then (coalesce(c.total_spend, 0) / c.total_orders) >= 60
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
      when 'morning' then b.fact_completed >= 2 and b.morning_count * 2 >= b.fact_completed
      when 'midnight' then b.fact_completed >= 2 and b.midnight_count * 2 >= b.fact_completed
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
  'contactable_matched', (select count(*) filter (where contactable) from filtered),
  'pagination', jsonb_build_object(
    'page', (select page from params),
    'page_size', (select page_size from params),
    'total_pages',
      ceil((select count(*) from filtered)::numeric / (select page_size from params))::int
  ),
  'items', (
    select coalesce(jsonb_agg(to_jsonb(t) order by t.updated_at desc), '[]'::jsonb)
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

revoke all on function public.get_customer_segment_page(uuid, text, text, int, int) from public;
revoke all on function public.get_customer_segment_page(uuid, text, text, int, int) from anon, authenticated;
grant execute on function public.get_customer_segment_page(uuid, text, text, int, int) to service_role;;
