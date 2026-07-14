-- WhatsOrder: consolidate permissive SELECT policies (perf-advisor cleanup)
--
-- Every tenant-scoped SELECT policy was paired with a separate super-admin
-- SELECT policy (and, on menu tables, a public policy), all targeting role
-- `public`. Postgres evaluates every permissive policy on every read, so the
-- advisor raised 138 multiple_permissive_policies warnings. Permissive
-- policies OR together, so merging each set into ONE policy per role with the
-- same predicates OR'd is semantically identical — the quals below are copied
-- verbatim from live pg_policies, not re-derived.
--
-- Each policy is scoped to the role(s) that can actually use it instead of
-- `public`, so anon queries skip policy evaluation entirely on staff tables.
--
-- ⚠️ Role scoping is load-bearing, not just an optimization: policy
-- expressions execute with the CALLER's privileges, and 20260702120000
-- revoked anon EXECUTE on is_restaurant_member / is_super_admin. Any policy
-- evaluated as anon must therefore reference only anon-executable functions
-- (is_public_restaurant). That is why the menu tables and plans get a
-- separate `to anon` policy without the helper calls instead of one shared
-- policy. (Applied to the live project as consolidate_select_policies +
-- fix_anon_menu_policies + fix_anon_plans_policy; this file is the combined
-- corrected form for fresh environments.)
--
-- Writes remain service-role only; this migration touches SELECT policies
-- exclusively and self-verifies that no write policy exists afterwards.

-- ── Menu tables: anon reads the public menu; authenticated adds tenant/super ─
drop policy if exists "Public can read active categories" on public.menu_categories;
drop policy if exists "Restaurant users can read own categories" on public.menu_categories;
drop policy if exists "Super admins can read all categories" on public.menu_categories;
drop policy if exists "Read categories (public menu, members, super admins)" on public.menu_categories;
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

drop policy if exists "Public can read menu items for active restaurants" on public.menu_items;
drop policy if exists "Restaurant users can read own menu items" on public.menu_items;
drop policy if exists "Super admins can read all menu items" on public.menu_items;
drop policy if exists "Read menu items (public menu, members, super admins)" on public.menu_items;
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

drop policy if exists "Public can read active menu offers" on public.menu_offers;
drop policy if exists "Restaurant users can read own menu offers" on public.menu_offers;
drop policy if exists "Super admins can read all menu offers" on public.menu_offers;
drop policy if exists "Read menu offers (public menu, members, super admins)" on public.menu_offers;
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

-- ── Plans: anon sees active plans; authenticated adds the super-admin OR ────
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

-- ── Tenant + super admin pairs (member roles unrestricted) ──────────────────
drop policy if exists "Restaurant users can read own restaurants" on public.restaurants;
drop policy if exists "Super admins can read all restaurants" on public.restaurants;
create policy "Read restaurants (members, super admins)"
on public.restaurants for select
to authenticated
using (public.is_restaurant_member(id) or public.is_super_admin());

drop policy if exists "Restaurant users can read own orders" on public.orders;
drop policy if exists "Super admins can read all orders" on public.orders;
create policy "Read orders (members, super admins)"
on public.orders for select
to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists "Restaurant users can read own onboarding tasks" on public.onboarding_tasks;
drop policy if exists "Super admins can read all onboarding tasks" on public.onboarding_tasks;
create policy "Read onboarding tasks (members, super admins)"
on public.onboarding_tasks for select
to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists "Restaurant users can read own order status events" on public.order_status_events;
drop policy if exists "Super admins can read all order status events" on public.order_status_events;
create policy "Read order status events (members, super admins)"
on public.order_status_events for select
to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists "Restaurant users can read own order print events" on public.order_print_events;
drop policy if exists "Super admins can read all order print events" on public.order_print_events;
create policy "Read order print events (members, super admins)"
on public.order_print_events for select
to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists "Restaurant users can read own order payment events" on public.order_payment_events;
drop policy if exists "Super admins can read all order payment events" on public.order_payment_events;
create policy "Read order payment events (members, super admins)"
on public.order_payment_events for select
to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists "Restaurant users can read own daily summary runs" on public.daily_summary_runs;
drop policy if exists "Super admins can read all daily summary runs" on public.daily_summary_runs;
create policy "Read daily summary runs (members, super admins)"
on public.daily_summary_runs for select
to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists "Restaurant users can read own ai image generations" on public.ai_image_generations;
drop policy if exists "Super admins can read all ai image generations" on public.ai_image_generations;
create policy "Read ai image generations (members, super admins)"
on public.ai_image_generations for select
to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists "Restaurant members can read own invoices" on public.invoices;
drop policy if exists "Super admins can read all invoices" on public.invoices;
create policy "Read invoices (members, super admins)"
on public.invoices for select
to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists "Restaurant members can read own invoice line items" on public.invoice_line_items;
drop policy if exists "Super admins can read all invoice line items" on public.invoice_line_items;
create policy "Read invoice line items (members, super admins)"
on public.invoice_line_items for select
to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists "Restaurant members can read own payments" on public.payments;
drop policy if exists "Super admins can read all payments" on public.payments;
create policy "Read payments (members, super admins)"
on public.payments for select
to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists "Restaurant members can read own subscription" on public.subscriptions;
drop policy if exists "Super admins can read all subscriptions" on public.subscriptions;
create policy "Read subscriptions (members, super admins)"
on public.subscriptions for select
to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists "Restaurant members can read own status events" on public.subscription_status_events;
drop policy if exists "Super admins can read all status events" on public.subscription_status_events;
create policy "Read subscription status events (members, super admins)"
on public.subscription_status_events for select
to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

-- ── Management-role tables (staff excluded from CRM/loyalty/feedback) ───────
drop policy if exists "Restaurant managers can read own customers" on public.customers;
drop policy if exists "Super admins can read all customers" on public.customers;
create policy "Read customers (managers, super admins)"
on public.customers for select
to authenticated
using (
  public.is_restaurant_member(
    restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
  or public.is_super_admin()
);

drop policy if exists "Restaurant managers can read own loyalty transactions" on public.loyalty_transactions;
drop policy if exists "Super admins can read all loyalty transactions" on public.loyalty_transactions;
create policy "Read loyalty transactions (managers, super admins)"
on public.loyalty_transactions for select
to authenticated
using (
  public.is_restaurant_member(
    restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
  or public.is_super_admin()
);

drop policy if exists "Restaurant managers can read own feedback" on public.customer_feedback;
drop policy if exists "Super admins can read all feedback" on public.customer_feedback;
create policy "Read feedback (managers, super admins)"
on public.customer_feedback for select
to authenticated
using (
  public.is_restaurant_member(
    restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
  or public.is_super_admin()
);

-- ── Identity tables ──────────────────────────────────────────────────────────
-- The 20260702120000 rewrite of "Users can read own profile" already includes
-- the super-admin OR, so the standalone super-admin policy is now redundant.
drop policy if exists "Super admins can read all profiles" on public.profiles;
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Read profiles (own row, super admins)"
on public.profiles for select
to authenticated
using ((id = (select auth.uid())) or public.is_super_admin());

drop policy if exists "Restaurant users can read own memberships" on public.restaurant_users;
drop policy if exists "Super admins can read all restaurant users" on public.restaurant_users;
create policy "Read memberships (own rows, super admins)"
on public.restaurant_users for select
to authenticated
using ((user_id = (select auth.uid())) or public.is_super_admin());

-- ── Shift tables: managers see all, staff see open/own ──────────────────────
drop policy if exists "Restaurant managers can read all shifts" on public.restaurant_shifts;
drop policy if exists "Restaurant staff can read current and own shifts" on public.restaurant_shifts;
create policy "Read shifts (managers all, staff open or own)"
on public.restaurant_shifts for select
to authenticated
using (
  public.is_restaurant_member(
    restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
  or (
    public.is_restaurant_member(restaurant_id, array['staff'])
    and (status = 'open' or opened_by_user_id = (select auth.uid()))
  )
);

drop policy if exists "Restaurant managers can read all shift paid outs" on public.shift_cash_paid_outs;
drop policy if exists "Restaurant staff can read current shift paid outs" on public.shift_cash_paid_outs;
create policy "Read shift paid outs (managers all, staff open or own)"
on public.shift_cash_paid_outs for select
to authenticated
using (
  public.is_restaurant_member(
    restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
  or (
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
  )
);

-- ── Self-verification ────────────────────────────────────────────────────────
do $verify_consolidation$
declare
  offending record;
  visible_count integer;
begin
  -- Staff tables: exactly one SELECT policy. Menu tables + plans: exactly one
  -- per role (anon + authenticated = 2).
  for offending in
    select tablename, count(*) as policy_count
    from pg_policies
    where schemaname = 'public'
      and cmd = 'SELECT'
      and tablename in (
        'restaurants', 'orders', 'onboarding_tasks', 'order_status_events',
        'order_print_events', 'order_payment_events', 'daily_summary_runs',
        'ai_image_generations', 'invoices', 'invoice_line_items', 'payments',
        'subscriptions', 'subscription_status_events', 'customers',
        'loyalty_transactions', 'customer_feedback', 'profiles',
        'restaurant_users', 'restaurant_shifts', 'shift_cash_paid_outs'
      )
    group by tablename
    having count(*) <> 1
  loop
    raise exception 'Table % has % SELECT policies after consolidation',
      offending.tablename, offending.policy_count;
  end loop;

  for offending in
    select tablename, count(*) as policy_count
    from pg_policies
    where schemaname = 'public'
      and cmd = 'SELECT'
      and tablename in ('menu_categories', 'menu_items', 'menu_offers', 'plans')
    group by tablename
    having count(*) <> 2
  loop
    raise exception 'Menu table % has % SELECT policies (expected anon + authenticated)',
      offending.tablename, offending.policy_count;
  end loop;

  -- No policy may target role `public` anymore: anything anon-evaluated must
  -- avoid the authenticated-only helper functions.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and roles = '{public}'
  ) then
    raise exception 'A policy still targets role public after consolidation';
  end if;

  -- No write policy may exist anywhere (P0-3 invariant, re-asserted).
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'A write policy exists after SELECT-policy consolidation';
  end if;

  -- Anon must be able to read the public menu without permission errors
  -- (policy expressions run with the caller's privileges).
  set local role anon;
  select count(*) into visible_count from public.menu_items;
  reset role;

  if visible_count is null then
    raise exception 'Anon menu read verification failed';
  end if;
end;
$verify_consolidation$;

notify pgrst, 'reload schema';

-- Rollback: recreate the previous per-audience policies from
-- 20260620163000_p0_3_least_privilege_rls.sql and the feature migrations that
-- added the billing/shift/daily-summary/ai-image policies.
