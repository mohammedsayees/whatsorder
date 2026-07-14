-- WhatsOrder: WhatsApp customer-service window tracking + status notifications.
--
-- Any inbound WhatsApp message opens Meta's 24h customer-service window, in
-- which free-form Cloud API sends are free. The webhook upserts a row per
-- (restaurant, sender phone); the order status actions consult it before
-- sending "order accepted / ready / completed" texts, so we never attempt a
-- send Meta would reject (outside-window sends need paid templates — phase 2).
--
-- Service-role only, like order_submission_keys: RLS enabled with NO policies
-- and no grants, so the table is invisible to anon/authenticated JWTs. Phones
-- are stored digits-only, the same convention as customers.phone.

create table if not exists public.whatsapp_service_windows (
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  phone text not null,
  last_inbound_at timestamptz not null,
  primary key (restaurant_id, phone)
);

alter table public.whatsapp_service_windows enable row level security;

revoke all on table public.whatsapp_service_windows from anon, authenticated;

-- Per-restaurant kill switch for customer status notifications (default on:
-- sends are free in-window and no-op until WhatsApp env vars are configured).
alter table public.restaurants
  add column if not exists status_notifications_enabled boolean not null default true;

do $verify_service_windows$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'whatsapp_service_windows'
  ) then
    raise exception 'whatsapp_service_windows must have no RLS policies (service-role only)';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'restaurants'
      and column_name = 'status_notifications_enabled'
  ) then
    raise exception 'restaurants.status_notifications_enabled missing';
  end if;
end;
$verify_service_windows$;

notify pgrst, 'reload schema';
