-- WhatsOrder P0-2b: enforce the safe public restaurant projection
-- Run only after the P0-2 application deployment is live and smoke-tested.

-- Public menu policies must not depend on anonymous access to the private base
-- restaurant row.
drop policy if exists "Public can read active categories"
on public.menu_categories;
create policy "Public can read active categories"
on public.menu_categories for select
using (
  is_active = true
  and public.is_public_restaurant(menu_categories.restaurant_id)
);

drop policy if exists "Public can read menu items for active restaurants"
on public.menu_items;
create policy "Public can read menu items for active restaurants"
on public.menu_items for select
using (
  is_available = true
  and public.is_public_restaurant(menu_items.restaurant_id)
);

drop policy if exists "Public can read active menu offers"
on public.menu_offers;
create policy "Public can read active menu offers"
on public.menu_offers for select
using (
  is_active = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
  and public.is_public_restaurant(menu_offers.restaurant_id)
);

drop policy if exists "Public can read active restaurants"
on public.restaurants;

revoke select on table public.restaurants from public;
revoke select on table public.restaurants from anon;

-- Authenticated dashboard access remains controlled by restaurant and Super
-- Admin SELECT policies. Service-role server actions retain full access.
grant select on table public.restaurants to authenticated;
grant all on table public.restaurants to service_role;

notify pgrst, 'reload schema';

-- Rollback considerations:
-- 1. Roll back the application to direct table reads before dropping the RPC.
-- 2. Do not permanently restore anonymous SELECT on public.restaurants; doing
--    so re-exposes owner contact details and internal notes.
-- 3. If emergency compatibility is required, restore the old policy only for
--    the shortest possible window while fixing or rolling back the app.
