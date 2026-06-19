-- WhatsOrder restaurant offer carousel
-- Run after security_hardening_migration.sql and arabic_menu_fields_migration.sql.

create table if not exists public.menu_offers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  title text not null,
  title_ar text,
  description text,
  description_ar text,
  promotional_price numeric(10, 2) not null check (promotional_price >= 0),
  max_quantity_per_order integer not null default 1
    constraint menu_offers_max_quantity_check
    check (max_quantity_per_order between 1 and 25),
  starts_at timestamptz,
  ends_at timestamptz,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

alter table public.menu_offers
add column if not exists max_quantity_per_order integer not null default 1;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'menu_offers_max_quantity_check'
  ) then
    alter table public.menu_offers
    add constraint menu_offers_max_quantity_check
    check (max_quantity_per_order between 1 and 25);
  end if;
end;
$migration$;

create unique index if not exists idx_menu_offers_restaurant_item_unique
on public.menu_offers(restaurant_id, menu_item_id);

create index if not exists idx_menu_offers_restaurant_active_order
on public.menu_offers(restaurant_id, is_active, display_order);

drop trigger if exists menu_offers_set_updated_at on public.menu_offers;
create trigger menu_offers_set_updated_at
before update on public.menu_offers
for each row execute function public.set_updated_at();

alter table public.menu_offers enable row level security;

drop policy if exists "Public can read active menu offers" on public.menu_offers;
create policy "Public can read active menu offers"
on public.menu_offers for select
using (
  is_active = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
  and exists (
    select 1
    from public.restaurants
    where restaurants.id = menu_offers.restaurant_id
      and restaurants.is_active = true
      and restaurants.status in ('live', 'trial', 'paid')
  )
);

drop policy if exists "Restaurant managers can manage own menu offers" on public.menu_offers;
create policy "Restaurant managers can manage own menu offers"
on public.menu_offers for all
using (
  is_restaurant_member(
    menu_offers.restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
)
with check (
  is_restaurant_member(
    menu_offers.restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
);

drop policy if exists "Super admins can manage all menu offers" on public.menu_offers;
create policy "Super admins can manage all menu offers"
on public.menu_offers for all
using (is_super_admin())
with check (is_super_admin());

notify pgrst, 'reload schema';
