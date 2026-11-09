-- Tenant-scoped delivery rider directory and durable order assignment history.
-- Riders are operational contacts, not dashboard users. All writes remain
-- service-role-only; authenticated restaurant members receive tenant-scoped read access.

create table public.delivery_riders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  phone text not null check (phone ~ '^[0-9]{7,15}$'),
  is_active boolean not null default true,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint delivery_riders_id_restaurant_unique unique (id, restaurant_id),
  constraint delivery_riders_restaurant_phone_unique unique (restaurant_id, phone)
);

create table public.order_rider_assignments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null,
  rider_id uuid not null,
  assigned_by_user_id uuid references auth.users(id) on delete set null,
  delivery_status text not null default 'sending'
    check (delivery_status in ('sending', 'accepted', 'skipped', 'failed')),
  delivery_reason text,
  transport_message_id text,
  created_at timestamptz not null default now(),
  constraint order_rider_assignments_order_tenant_fk
    foreign key (order_id, restaurant_id)
    references public.orders(id, restaurant_id) on delete cascade,
  constraint order_rider_assignments_rider_tenant_fk
    foreign key (rider_id, restaurant_id)
    references public.delivery_riders(id, restaurant_id)
);

create index order_rider_assignments_current
  on public.order_rider_assignments(restaurant_id, order_id, created_at desc, id desc);
create index delivery_riders_active
  on public.delivery_riders(restaurant_id, is_active, name);

alter table public.delivery_riders enable row level security;
alter table public.order_rider_assignments enable row level security;

revoke all on public.delivery_riders, public.order_rider_assignments
from public, anon, authenticated;
grant select on public.delivery_riders, public.order_rider_assignments
to authenticated;
grant all on public.delivery_riders, public.order_rider_assignments
to service_role;

create policy delivery_riders_tenant_read
on public.delivery_riders for select to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.is_super_admin()
);

create policy order_rider_assignments_tenant_read
on public.order_rider_assignments for select to authenticated
using (
  public.is_restaurant_member(restaurant_id)
  or public.is_super_admin()
);

comment on table public.delivery_riders is
  'Tenant-scoped delivery contacts selectable by restaurant staff.';
comment on table public.order_rider_assignments is
  'Append-only rider assignment and WhatsApp transport outcome history.';

notify pgrst, 'reload schema';
