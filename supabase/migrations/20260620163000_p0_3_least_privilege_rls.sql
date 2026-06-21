-- WhatsOrder P0-3: least-privilege RLS and direct grants
-- Run after 20260620162000_p0_2b_enforce_public_restaurant_projection.sql.
--
-- Restaurant-facing writes are performed by authenticated Next.js server
-- actions with the service-role client. Authenticated browser/JWT access is
-- read-only and tenant-scoped so UI restrictions cannot be bypassed through
-- direct REST calls.

-- Remove broad restaurant-role mutation policies.
drop policy if exists "Restaurant admins can update own restaurants"
on public.restaurants;
drop policy if exists "Restaurant users can manage own categories"
on public.menu_categories;
drop policy if exists "Restaurant users can manage own menu items"
on public.menu_items;
drop policy if exists "Restaurant managers can manage own menu offers"
on public.menu_offers;
drop policy if exists "Restaurant users can manage own orders"
on public.orders;
drop policy if exists "Restaurant users can manage own customers"
on public.customers;
drop policy if exists "Restaurant users can manage own loyalty transactions"
on public.loyalty_transactions;
drop policy if exists "Restaurant managers can moderate own feedback"
on public.customer_feedback;
drop policy if exists "Restaurant owners can manage own users"
on public.restaurant_users;

-- Super Admin mutations also flow through authenticated server actions. Keep
-- direct JWT access read-only while preserving cross-tenant visibility.
drop policy if exists "Super admins can manage all restaurants"
on public.restaurants;
drop policy if exists "Super admins can manage all categories"
on public.menu_categories;
drop policy if exists "Super admins can manage all menu items"
on public.menu_items;
drop policy if exists "Super admins can manage all menu offers"
on public.menu_offers;
drop policy if exists "Super admins can manage all orders"
on public.orders;
drop policy if exists "Super admins can manage all customers"
on public.customers;
drop policy if exists "Super admins can manage onboarding tasks"
on public.onboarding_tasks;
drop policy if exists "Super admins can manage profiles"
on public.profiles;
drop policy if exists "Super admins can manage restaurant users"
on public.restaurant_users;

-- Tenant-scoped operational reads available to every accepted restaurant role.
drop policy if exists "Restaurant users can read own restaurants"
on public.restaurants;
create policy "Restaurant users can read own restaurants"
on public.restaurants for select
using (public.is_restaurant_member(restaurants.id));

drop policy if exists "Restaurant users can read own categories"
on public.menu_categories;
create policy "Restaurant users can read own categories"
on public.menu_categories for select
using (public.is_restaurant_member(menu_categories.restaurant_id));

drop policy if exists "Restaurant users can read own menu items"
on public.menu_items;
create policy "Restaurant users can read own menu items"
on public.menu_items for select
using (public.is_restaurant_member(menu_items.restaurant_id));

drop policy if exists "Restaurant users can read own menu offers"
on public.menu_offers;
create policy "Restaurant users can read own menu offers"
on public.menu_offers for select
using (public.is_restaurant_member(menu_offers.restaurant_id));

drop policy if exists "Restaurant users can read own orders"
on public.orders;
create policy "Restaurant users can read own orders"
on public.orders for select
using (public.is_restaurant_member(orders.restaurant_id));

drop policy if exists "Restaurant admins can read onboarding tasks"
on public.onboarding_tasks;
drop policy if exists "Restaurant users can read own onboarding tasks"
on public.onboarding_tasks;
create policy "Restaurant users can read own onboarding tasks"
on public.onboarding_tasks for select
using (public.is_restaurant_member(onboarding_tasks.restaurant_id));

-- Customer, loyalty, feedback, and reporting data are restricted to management
-- roles. Staff can fulfil orders using the order row without browsing the CRM.
drop policy if exists "Restaurant managers can read own customers"
on public.customers;
create policy "Restaurant managers can read own customers"
on public.customers for select
using (
  public.is_restaurant_member(
    customers.restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
);

drop policy if exists "Restaurant managers can read own loyalty transactions"
on public.loyalty_transactions;
create policy "Restaurant managers can read own loyalty transactions"
on public.loyalty_transactions for select
using (
  public.is_restaurant_member(
    loyalty_transactions.restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
);

drop policy if exists "Restaurant users can read own feedback"
on public.customer_feedback;
drop policy if exists "Restaurant managers can read own feedback"
on public.customer_feedback;
create policy "Restaurant managers can read own feedback"
on public.customer_feedback for select
using (
  public.is_restaurant_member(
    customer_feedback.restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
);

-- Membership rows remain visible only to the member. Team administration uses
-- server actions after owner/admin authorization.
drop policy if exists "Restaurant users can read own memberships"
on public.restaurant_users;
create policy "Restaurant users can read own memberships"
on public.restaurant_users for select
using (restaurant_users.user_id = auth.uid());

-- Super Admin has cross-tenant read visibility. All writes still use the
-- service-role server action layer.
drop policy if exists "Super admins can read all restaurants"
on public.restaurants;
create policy "Super admins can read all restaurants"
on public.restaurants for select
using (public.is_super_admin());

drop policy if exists "Super admins can read all categories"
on public.menu_categories;
create policy "Super admins can read all categories"
on public.menu_categories for select
using (public.is_super_admin());

drop policy if exists "Super admins can read all menu items"
on public.menu_items;
create policy "Super admins can read all menu items"
on public.menu_items for select
using (public.is_super_admin());

drop policy if exists "Super admins can read all menu offers"
on public.menu_offers;
create policy "Super admins can read all menu offers"
on public.menu_offers for select
using (public.is_super_admin());

drop policy if exists "Super admins can read all orders"
on public.orders;
create policy "Super admins can read all orders"
on public.orders for select
using (public.is_super_admin());

drop policy if exists "Super admins can read all customers"
on public.customers;
create policy "Super admins can read all customers"
on public.customers for select
using (public.is_super_admin());

drop policy if exists "Super admins can read all loyalty transactions"
on public.loyalty_transactions;
create policy "Super admins can read all loyalty transactions"
on public.loyalty_transactions for select
using (public.is_super_admin());

drop policy if exists "Super admins can read all feedback"
on public.customer_feedback;
create policy "Super admins can read all feedback"
on public.customer_feedback for select
using (public.is_super_admin());

drop policy if exists "Super admins can read all onboarding tasks"
on public.onboarding_tasks;
create policy "Super admins can read all onboarding tasks"
on public.onboarding_tasks for select
using (public.is_super_admin());

drop policy if exists "Super admins can read all restaurant users"
on public.restaurant_users;
create policy "Super admins can read all restaurant users"
on public.restaurant_users for select
using (public.is_super_admin());

drop policy if exists "Super admins can read all profiles"
on public.profiles;
create policy "Super admins can read all profiles"
on public.profiles for select
using (public.is_super_admin());

-- Remove inherited broad table privileges before granting only required reads.
revoke all on table public.restaurants from anon, authenticated;
revoke all on table public.menu_categories from anon, authenticated;
revoke all on table public.menu_items from anon, authenticated;
revoke all on table public.menu_offers from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.customers from anon, authenticated;
revoke all on table public.loyalty_transactions from anon, authenticated;
revoke all on table public.customer_feedback from anon, authenticated;
revoke all on table public.feedback_requests from anon, authenticated;
revoke all on table public.onboarding_tasks from anon, authenticated;
revoke all on table public.restaurant_users from anon, authenticated;
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.order_status_events from anon, authenticated;
revoke all on table public.order_print_events from anon, authenticated;
revoke all on table public.order_submission_attempts from anon, authenticated;
revoke all on table public.order_submission_keys from anon, authenticated;
revoke all on sequence public.order_submission_attempts_id_seq
from anon, authenticated;

-- Anonymous reads are limited to active public menu data. Restaurant details
-- are available only through get_public_restaurant.
grant select on table public.menu_categories to anon;
grant select on table public.menu_items to anon;
grant select on table public.menu_offers to anon;

-- Authenticated JWTs are read-only; RLS applies tenant and role restrictions.
grant select on table public.restaurants to authenticated;
grant select on table public.menu_categories to authenticated;
grant select on table public.menu_items to authenticated;
grant select on table public.menu_offers to authenticated;
grant select on table public.orders to authenticated;
grant select on table public.customers to authenticated;
grant select on table public.loyalty_transactions to authenticated;
grant select on table public.customer_feedback to authenticated;
grant select on table public.onboarding_tasks to authenticated;
grant select on table public.restaurant_users to authenticated;
grant select on table public.profiles to authenticated;
grant select on table public.order_status_events to authenticated;
grant select on table public.order_print_events to authenticated;

-- Future public-schema objects must fail closed. Migrations that intentionally
-- expose a table or RPC must grant that access explicitly.
alter default privileges for role postgres in schema public
revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
revoke all on functions from anon, authenticated;

-- Trigger and internal validation functions must not be called directly.
revoke all on function public.handle_new_user_profile()
from public, anon, authenticated;
revoke all on function public.set_updated_at()
from public, anon, authenticated;
revoke all on function public.is_restaurant_open_at(
  boolean, jsonb, timestamptz
) from public, anon, authenticated;
revoke all on function public.normalize_customer_phone(text)
from public, anon, authenticated;

-- Policy helper functions remain callable only where RLS requires them.
revoke all on function public.is_restaurant_member(uuid, text[])
from public, anon, authenticated;
grant execute on function public.is_restaurant_member(uuid, text[])
to authenticated, service_role;

revoke all on function public.is_super_admin()
from public, anon, authenticated;
grant execute on function public.is_super_admin()
to authenticated, service_role;

-- Fail the migration if any broad restaurant-user write policy survived.
do $verify_least_privilege$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'restaurants',
        'menu_categories',
        'menu_items',
        'menu_offers',
        'orders',
        'customers',
        'loyalty_transactions',
        'customer_feedback',
        'restaurant_users'
      )
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and policyname not like 'Public can read%'
  ) then
    raise exception 'Broad write policy remains after least-privilege migration';
  end if;
end;
$verify_least_privilege$;

notify pgrst, 'reload schema';

-- Rollback considerations:
-- Do not restore the former FOR ALL policies. If an application workflow fails,
-- repair its authenticated server action or service-role RPC. Realtime requires
-- authenticated SELECT on orders plus the tenant-scoped SELECT policy above.
