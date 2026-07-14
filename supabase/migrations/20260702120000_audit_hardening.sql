-- WhatsOrder audit hardening (2026-07-02 full audit)
--
-- 1. SECURITY (P0/P1): lock down the two loyalty RPCs that were left
--    PUBLIC-executable. Both are SECURITY DEFINER, so any anon-key holder
--    could call them via PostgREST:
--      - redeem_loyalty_reward: unauthenticated WRITE (burns a customer's stamps)
--      - get_loyalty_progress: phone-enumeration / loyalty-balance leak
--    The app only ever calls them with the service-role client
--    (src/app/actions.ts, src/lib/loyalty-progress.ts).
-- 2. SECURITY (P2): re-assert the P0-3 grants on the policy helper functions
--    (advisor flagged them as anon-executable again — replacing a function
--    re-applies default PUBLIC execute), and pin daily_summary_numbers's
--    search_path.
-- 3. PERFORMANCE: drop the duplicate unique constraint on
--    customers(restaurant_id, phone) — customers_restaurant_phone_uniq is
--    byte-for-byte identical to customers_restaurant_id_phone_key (advisor
--    "duplicate_index"). No function or upsert references either constraint
--    by name (verified against pg_proc), and ON CONFLICT (restaurant_id,
--    phone) resolves to the surviving index.
-- 4. PERFORMANCE: rewrite the four policies flagged by auth_rls_initplan so
--    auth.uid() is evaluated once per statement instead of once per row.
--    The predicates are logically identical.

-- ── 1. Loyalty RPC lockdown ─────────────────────────────────────────────────
revoke all on function public.redeem_loyalty_reward(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.redeem_loyalty_reward(uuid, uuid)
to service_role;

revoke all on function public.get_loyalty_progress(uuid, text)
from public, anon, authenticated;
grant execute on function public.get_loyalty_progress(uuid, text)
to service_role;

-- ── 2. Helper-function grants + search_path pin ─────────────────────────────
-- authenticated keeps EXECUTE: these run inside RLS policy expressions under
-- the caller's role. anon must not call them directly.
revoke all on function public.is_restaurant_member(uuid, text[])
from public, anon;
grant execute on function public.is_restaurant_member(uuid, text[])
to authenticated, service_role;

revoke all on function public.is_super_admin()
from public, anon;
grant execute on function public.is_super_admin()
to authenticated, service_role;

alter function public.daily_summary_numbers(uuid, date)
set search_path = public;

-- ── 3. Duplicate unique constraint on customers ─────────────────────────────
alter table public.customers
drop constraint if exists customers_restaurant_phone_uniq;

-- ── 4. auth_rls_initplan: evaluate auth.uid() once per statement ────────────
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
using ((id = (select auth.uid())) or public.is_super_admin());

drop policy if exists "Restaurant users can read own memberships"
on public.restaurant_users;
create policy "Restaurant users can read own memberships"
on public.restaurant_users for select
using (user_id = (select auth.uid()));

drop policy if exists "Restaurant staff can read current and own shifts"
on public.restaurant_shifts;
create policy "Restaurant staff can read current and own shifts"
on public.restaurant_shifts for select
using (
  public.is_restaurant_member(restaurant_id, array['staff'])
  and (status = 'open' or opened_by_user_id = (select auth.uid()))
);

drop policy if exists "Restaurant staff can read current shift paid outs"
on public.shift_cash_paid_outs;
create policy "Restaurant staff can read current shift paid outs"
on public.shift_cash_paid_outs for select
using (
  public.is_restaurant_member(restaurant_id, array['staff'])
  and exists (
    select 1
    from public.restaurant_shifts shift
    where shift.id = shift_cash_paid_outs.shift_id
      and shift.restaurant_id = shift_cash_paid_outs.restaurant_id
      and (
        shift.status = 'open'
        or shift.opened_by_user_id = (select auth.uid())
      )
  )
);

-- ── Self-verification: fail loudly if the loyalty RPCs are still public ─────
do $verify_audit_hardening$
begin
  if has_function_privilege('anon', 'public.redeem_loyalty_reward(uuid, uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.redeem_loyalty_reward(uuid, uuid)', 'execute')
    or has_function_privilege('anon', 'public.get_loyalty_progress(uuid, text)', 'execute')
    or has_function_privilege('authenticated', 'public.get_loyalty_progress(uuid, text)', 'execute')
  then
    raise exception 'Loyalty RPCs remain executable by anon/authenticated after audit hardening';
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.customers'::regclass
      and conname = 'customers_restaurant_phone_uniq'
  ) then
    raise exception 'Duplicate customers unique constraint still present';
  end if;
end;
$verify_audit_hardening$;

notify pgrst, 'reload schema';
