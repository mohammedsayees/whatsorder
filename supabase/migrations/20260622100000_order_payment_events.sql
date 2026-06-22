-- WhatsOrder: audit trail for payment-method corrections
--
-- Staff can fix a mis-punched Cash/Card on an order; every change is recorded
-- here so managers/owners have visibility into who changed what and when.
-- Writes happen only through the authenticated service-role server action;
-- authenticated JWT access is read-only and tenant-scoped (mirrors
-- order_status_events).

create table if not exists public.order_payment_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  from_method text,
  to_method text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  created_at timestamptz not null default now()
);

create index if not exists idx_order_payment_events_order_created
on public.order_payment_events(restaurant_id, order_id, created_at desc);

alter table public.order_payment_events enable row level security;

drop policy if exists "Restaurant users can read own order payment events"
on public.order_payment_events;
create policy "Restaurant users can read own order payment events"
on public.order_payment_events for select
using (public.is_restaurant_member(order_payment_events.restaurant_id));

drop policy if exists "Super admins can read all order payment events"
on public.order_payment_events;
create policy "Super admins can read all order payment events"
on public.order_payment_events for select
using (public.is_super_admin());

revoke all on table public.order_payment_events from anon, authenticated;
grant select on table public.order_payment_events to authenticated;

notify pgrst, 'reload schema';
