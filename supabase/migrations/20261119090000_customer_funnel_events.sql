-- Customer ordering funnel: anonymous step events from the public ordering
-- pages (menu viewed -> item added -> checkout -> order saved -> WhatsApp
-- opened), so each restaurant can see where customers drop off.
--
-- Privacy: no personal data. session_id is a random per-visit token created
-- in the browser; no IP, user agent, name or phone is stored. order_key links
-- an event to the restaurant's own order only.
--
-- Writes: service role only, through the /api/customer/events route. There is
-- deliberately no anon/authenticated insert policy. The unique constraint
-- records each step at most once per visit (and once per order), which both
-- deduplicates retries and bounds what a single session can write.

create table if not exists public.customer_funnel_events (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  session_id text not null check (session_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  event_name text not null check (
    event_name in (
      'menu_view',
      'item_added',
      'search_used',
      'checkout_view',
      'checkout_blocked',
      'order_saved',
      'whatsapp_opened'
    )
  ),
  order_key text not null default '' check (
    order_key = ''
    or order_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  detail text check (detail is null or detail ~ '^[a-z_]{1,40}$'),
  fulfilment_type text check (
    fulfilment_type is null
    or fulfilment_type in ('delivery', 'takeaway', 'car_pickup', 'dine_in')
  ),
  created_at timestamptz not null default now(),
  constraint customer_funnel_events_once_per_visit
    unique (restaurant_id, session_id, event_name, order_key)
);

create index if not exists idx_customer_funnel_events_restaurant_created
on public.customer_funnel_events(restaurant_id, created_at desc);

alter table public.customer_funnel_events enable row level security;

drop policy if exists "Tenant members can read customer funnel events"
on public.customer_funnel_events;

create policy "Tenant members can read customer funnel events"
on public.customer_funnel_events
for select
using (
  public.is_restaurant_member(restaurant_id)
  or public.is_super_admin()
);

revoke all on table public.customer_funnel_events from anon, authenticated;
grant select on table public.customer_funnel_events to authenticated;

-- Distinct visits per step for one restaurant in [range_start, range_end).
-- Adds 'order_accepted': visits whose saved order the restaurant has since
-- moved past New (and not cancelled), read from the order itself. Called
-- server-side (service role) by the admin reports page after it has verified
-- the caller belongs to target_restaurant_id.
create or replace function public.customer_funnel_summary(
  target_restaurant_id uuid,
  range_start timestamptz,
  range_end timestamptz
)
returns table (event_name text, sessions bigint)
language sql
stable
security definer
set search_path = public
as $funnel_summary$
  select e.event_name, count(distinct e.session_id)::bigint as sessions
  from public.customer_funnel_events e
  where e.restaurant_id = target_restaurant_id
    and e.created_at >= range_start
    and e.created_at < range_end
  group by e.event_name
  union all
  select 'order_accepted', count(distinct e.session_id)::bigint
  from public.customer_funnel_events e
  join public.orders o
    on o.restaurant_id = e.restaurant_id
   and o.id::text = e.order_key
  where e.restaurant_id = target_restaurant_id
    and e.event_name = 'order_saved'
    and e.created_at >= range_start
    and e.created_at < range_end
    and o.status::text not in ('New', 'Cancelled');
$funnel_summary$;

revoke all on function public.customer_funnel_summary(uuid, timestamptz, timestamptz)
from public, anon, authenticated;
grant execute on function public.customer_funnel_summary(uuid, timestamptz, timestamptz)
to service_role;
