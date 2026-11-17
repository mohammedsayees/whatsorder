-- Rider live location for the customer's order page.
--
-- When staff assign a rider, the rider's WhatsApp message carries a private
-- tracking link. Opening it lets the rider's phone share GPS while the page
-- is open. Only the latest position per assignment is kept, it is shown to
-- the customer only while the order is Out for Delivery, and the application
-- deletes it once the delivery ends.
--
-- The link's secret is stored only as a SHA-256 hash. Writes are service
-- role only (/api/rider/location); no anon/authenticated write privileges.

alter table public.order_rider_assignments
  add column if not exists tracking_token_hash text;

do $tracking_hash_check$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_rider_assignments'::regclass
      and conname = 'order_rider_assignments_tracking_token_hash_format'
  ) then
    alter table public.order_rider_assignments
      add constraint order_rider_assignments_tracking_token_hash_format
      check (tracking_token_hash is null or tracking_token_hash ~ '^[0-9a-f]{64}$');
  end if;
end
$tracking_hash_check$;

create unique index if not exists order_rider_assignments_tracking_token
on public.order_rider_assignments(tracking_token_hash)
where tracking_token_hash is not null;

create table if not exists public.rider_live_locations (
  assignment_id uuid primary key
    references public.order_rider_assignments(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m real check (accuracy_m is null or accuracy_m >= 0),
  updated_at timestamptz not null default now(),
  constraint rider_live_locations_order_tenant_fk
    foreign key (order_id, restaurant_id)
    references public.orders(id, restaurant_id)
    on delete cascade
);

create index if not exists idx_rider_live_locations_order
on public.rider_live_locations(restaurant_id, order_id);

alter table public.rider_live_locations enable row level security;

drop policy if exists rider_live_locations_tenant_read on public.rider_live_locations;
create policy rider_live_locations_tenant_read
on public.rider_live_locations for select to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

revoke all on table public.rider_live_locations from public, anon, authenticated;
grant select on table public.rider_live_locations to authenticated;
grant all on table public.rider_live_locations to service_role;

comment on table public.rider_live_locations is
  'Latest rider position per assignment while delivering; deleted when the delivery ends.';
