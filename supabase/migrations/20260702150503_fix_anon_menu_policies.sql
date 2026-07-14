-- HOTFIX (applied live 2026-07-02, recorded remotely as 20260702150503):
-- anon menu reads broke after the first cut of the policy consolidation,
-- because policy expressions execute with the caller's privileges and anon
-- lost EXECUTE on is_restaurant_member / is_super_admin in audit_hardening.
-- Splits each menu policy per role so the anon policy references only
-- is_public_restaurant (anon-executable) and the authenticated policy
-- carries the member/super-admin OR.
--
-- NOTE: 20260702130000_consolidate_select_policies.sql in this repo is the
-- combined corrected form and already creates these policies — on a fresh
-- environment this file is a no-op re-assertion (drop + recreate the same
-- policies). It exists so the local directory matches the remote history.

drop policy if exists "Read categories (public menu, members, super admins)"
on public.menu_categories;
drop policy if exists "Anon can read public categories" on public.menu_categories;
drop policy if exists "Members and super admins can read categories" on public.menu_categories;
create policy "Anon can read public categories"
on public.menu_categories for select
to anon
using (is_active = true and public.is_public_restaurant(restaurant_id));
create policy "Members and super admins can read categories"
on public.menu_categories for select
to authenticated
using (
  (is_active = true and public.is_public_restaurant(restaurant_id))
  or public.is_restaurant_member(restaurant_id)
  or public.is_super_admin()
);

drop policy if exists "Read menu items (public menu, members, super admins)"
on public.menu_items;
drop policy if exists "Anon can read public menu items" on public.menu_items;
drop policy if exists "Members and super admins can read menu items" on public.menu_items;
create policy "Anon can read public menu items"
on public.menu_items for select
to anon
using (is_available = true and public.is_public_restaurant(restaurant_id));
create policy "Members and super admins can read menu items"
on public.menu_items for select
to authenticated
using (
  (is_available = true and public.is_public_restaurant(restaurant_id))
  or public.is_restaurant_member(restaurant_id)
  or public.is_super_admin()
);

drop policy if exists "Read menu offers (public menu, members, super admins)"
on public.menu_offers;
drop policy if exists "Anon can read public menu offers" on public.menu_offers;
drop policy if exists "Members and super admins can read menu offers" on public.menu_offers;
create policy "Anon can read public menu offers"
on public.menu_offers for select
to anon
using (
  is_active = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
  and public.is_public_restaurant(restaurant_id)
);
create policy "Members and super admins can read menu offers"
on public.menu_offers for select
to authenticated
using (
  (
    is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
    and public.is_public_restaurant(restaurant_id)
  )
  or public.is_restaurant_member(restaurant_id)
  or public.is_super_admin()
);

-- Verify the anon path works end to end: policy evaluation as anon must not
-- raise and must not call revoked helpers.
do $verify_anon_menu$
declare
  visible_count integer;
begin
  set local role anon;
  select count(*) into visible_count from public.menu_items;
  reset role;

  if visible_count is null then
    raise exception 'Anon menu read verification failed';
  end if;
end;
$verify_anon_menu$;

notify pgrst, 'reload schema';
