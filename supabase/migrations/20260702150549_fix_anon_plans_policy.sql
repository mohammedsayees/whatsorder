-- HOTFIX (applied live 2026-07-02, recorded remotely as 20260702150549):
-- same class of issue as fix_anon_menu_policies — the plans policy targeted
-- role `public` and its qual called is_super_admin(), which anon may no
-- longer execute. Split per role so anon sees active plans without touching
-- the helper.
--
-- NOTE: 20260702130000_consolidate_select_policies.sql in this repo is the
-- combined corrected form and already creates these policies — on a fresh
-- environment this file is a no-op re-assertion. It exists so the local
-- directory matches the remote history.

drop policy if exists "Active plans are world readable" on public.plans;
drop policy if exists "Anon can read active plans" on public.plans;
drop policy if exists "Authenticated can read active plans, super admins all" on public.plans;
create policy "Anon can read active plans"
on public.plans for select
to anon
using (is_active);
create policy "Authenticated can read active plans, super admins all"
on public.plans for select
to authenticated
using (is_active or public.is_super_admin());

do $verify_anon_plans$
declare
  visible_count integer;
begin
  set local role anon;
  select count(*) into visible_count from public.plans;
  reset role;

  if visible_count is null then
    raise exception 'Anon plans read verification failed';
  end if;
end;
$verify_anon_plans$;

notify pgrst, 'reload schema';
