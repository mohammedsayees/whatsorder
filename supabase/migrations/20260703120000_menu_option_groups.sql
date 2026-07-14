-- WhatsOrder: reusable option groups (variants + modifiers) for menu items.
--
-- A group with min_select = 1 and max_select = 1 behaves as a variant
-- (Size: Small/Large); any other min/max combination behaves as multi-select
-- add-ons. Option price_delta (absolute AED) is added to the item's — or the
-- offer's promotional — unit price at order verification time in
-- src/lib/order-pricing.ts. Orders keep storing a denormalized snapshot in
-- orders.items jsonb, so NO order-path function changes.
--
-- Security model (matches the rest of the menu schema):
--   * SELECT-only RLS; all writes go through service-role server actions.
--   * `to anon` policies reference ONLY is_public_restaurant — anon has no
--     EXECUTE on is_restaurant_member / is_super_admin, and policy
--     expressions run with the caller's privileges (see the 2026-07-02
--     fix_anon_menu_policies incident).
--   * The anon policy on menu_options filters is_available = true. This is
--     load-bearing: the customer order path re-verifies carts against the
--     anon-readable catalog, so an unavailable option disappears from the
--     verification catalog and gets rejected.
--   * Tenant-consistent composite FKs (P0-4 pattern) so a child row can
--     never point at another restaurant's parent.

create table if not exists public.menu_option_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  name_ar text,
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer check (max_select >= 1),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_option_groups_min_max_check
    check (max_select is null or max_select >= min_select),
  -- Parent-side composite key for tenant-consistent child FKs.
  constraint menu_option_groups_id_restaurant_unique unique (id, restaurant_id)
);

create table if not exists public.menu_options (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  group_id uuid not null,
  name text not null,
  name_ar text,
  price_delta numeric(10, 2) not null default 0,
  is_available boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint menu_options_group_tenant_fkey
    foreign key (group_id, restaurant_id)
    references public.menu_option_groups(id, restaurant_id) on delete cascade
);

create table if not exists public.menu_item_option_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id uuid not null,
  group_id uuid not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint menu_item_option_groups_unique unique (menu_item_id, group_id),
  constraint menu_item_option_groups_item_tenant_fkey
    foreign key (menu_item_id, restaurant_id)
    references public.menu_items(id, restaurant_id) on delete cascade,
  constraint menu_item_option_groups_group_tenant_fkey
    foreign key (group_id, restaurant_id)
    references public.menu_option_groups(id, restaurant_id) on delete cascade
);

create index if not exists idx_menu_option_groups_restaurant
  on public.menu_option_groups(restaurant_id, display_order);
create index if not exists idx_menu_options_group
  on public.menu_options(group_id, display_order);
create index if not exists idx_menu_options_restaurant
  on public.menu_options(restaurant_id);
create index if not exists idx_menu_item_option_groups_item
  on public.menu_item_option_groups(menu_item_id, display_order);
create index if not exists idx_menu_item_option_groups_restaurant
  on public.menu_item_option_groups(restaurant_id);

-- Keep updated_at fresh via the shared trigger function (same as menu_items).
drop trigger if exists set_menu_option_groups_updated_at on public.menu_option_groups;
create trigger set_menu_option_groups_updated_at
  before update on public.menu_option_groups
  for each row execute function public.set_updated_at();
drop trigger if exists set_menu_options_updated_at on public.menu_options;
create trigger set_menu_options_updated_at
  before update on public.menu_options
  for each row execute function public.set_updated_at();

alter table public.menu_option_groups enable row level security;
alter table public.menu_options enable row level security;
alter table public.menu_item_option_groups enable row level security;

-- SELECT policies, one per role per table. Writes stay service-role only.
create policy "Anon can read public option groups"
on public.menu_option_groups for select
to anon
using (public.is_public_restaurant(restaurant_id));
create policy "Members and super admins can read option groups"
on public.menu_option_groups for select
to authenticated
using (
  public.is_public_restaurant(restaurant_id)
  or public.is_restaurant_member(restaurant_id)
  or public.is_super_admin()
);

create policy "Anon can read public menu options"
on public.menu_options for select
to anon
using (is_available = true and public.is_public_restaurant(restaurant_id));
create policy "Members and super admins can read menu options"
on public.menu_options for select
to authenticated
using (
  (is_available = true and public.is_public_restaurant(restaurant_id))
  or public.is_restaurant_member(restaurant_id)
  or public.is_super_admin()
);

create policy "Anon can read public item option links"
on public.menu_item_option_groups for select
to anon
using (public.is_public_restaurant(restaurant_id));
create policy "Members and super admins can read item option links"
on public.menu_item_option_groups for select
to authenticated
using (
  public.is_public_restaurant(restaurant_id)
  or public.is_restaurant_member(restaurant_id)
  or public.is_super_admin()
);

-- Default privileges are revoked repo-wide (P0-3); grant reads explicitly.
revoke all on table public.menu_option_groups from anon, authenticated;
revoke all on table public.menu_options from anon, authenticated;
revoke all on table public.menu_item_option_groups from anon, authenticated;
grant select on table public.menu_option_groups to anon, authenticated;
grant select on table public.menu_options to anon, authenticated;
grant select on table public.menu_item_option_groups to anon, authenticated;

-- Self-verification: fail if a write policy slipped in, and prove the anon
-- read path works (policy expressions run with the caller's privileges).
do $verify_option_groups$
declare
  visible_count integer;
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('menu_option_groups', 'menu_options', 'menu_item_option_groups')
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'Write policy exists on option-group tables';
  end if;

  set local role anon;
  select count(*) into visible_count from public.menu_options;
  reset role;

  if visible_count is null then
    raise exception 'Anon menu_options read verification failed';
  end if;
end;
$verify_option_groups$;

notify pgrst, 'reload schema';
