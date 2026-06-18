-- WhatsOrder Super Admin foundation
-- Run this file once in the Supabase SQL Editor after the existing schema migrations.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $set_updated_at$
begin
  new.updated_at = now();
  return new;
end;
$set_updated_at$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'restaurant_admin'
    check (role in ('super_admin', 'restaurant_admin', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table restaurants add column if not exists owner_name text;
alter table restaurants add column if not exists owner_email text;
alter table restaurants add column if not exists owner_phone text;
alter table restaurants add column if not exists city text;
alter table restaurants add column if not exists subtitle text;
alter table restaurants add column if not exists cover_image_url text;
alter table restaurants add column if not exists status text not null default 'draft';
alter table restaurants add column if not exists plan text not null default 'trial';
alter table restaurants add column if not exists pickup_enabled boolean not null default true;
alter table restaurants add column if not exists delivery_enabled boolean not null default true;
alter table restaurants add column if not exists scheduled_orders_enabled boolean not null default false;
alter table restaurants add column if not exists internal_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_status_check'
  ) then
    alter table restaurants
      add constraint restaurants_status_check
      check (status in ('draft', 'onboarding', 'live', 'trial', 'paid', 'paused', 'cancelled'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'restaurants_plan_check'
  ) then
    alter table restaurants
      add constraint restaurants_plan_check
      check (plan in ('trial', 'starter', 'growth', 'pro', 'custom'));
  end if;
end $$;

alter table restaurant_users add column if not exists user_id uuid;
alter table restaurant_users drop constraint if exists restaurant_users_role_check;
alter table restaurant_users
  add constraint restaurant_users_role_check
  check (role in ('super_admin', 'restaurant_admin', 'staff', 'owner', 'manager'));

create table if not exists onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  task_key text not null,
  task_label text not null,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, task_key)
);

create index if not exists idx_profiles_role on profiles(role);
create index if not exists idx_restaurants_status on restaurants(status);
create index if not exists idx_restaurants_plan on restaurants(plan);
create index if not exists idx_onboarding_tasks_restaurant on onboarding_tasks(restaurant_id);

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
before update on profiles
for each row execute function public.set_updated_at();

drop trigger if exists onboarding_tasks_set_updated_at on onboarding_tasks;
create trigger onboarding_tasks_set_updated_at
before update on onboarding_tasks
for each row execute function public.set_updated_at();

create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $is_super_admin$
  select exists (
    select 1
    from profiles
    where profiles.id = auth.uid()
      and profiles.role = 'super_admin'
  );
$is_super_admin$;

create or replace function handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $handle_new_user_profile$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    'restaurant_admin'
  )
  on conflict (id) do nothing;
  return new;
end;
$handle_new_user_profile$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function handle_new_user_profile();

alter table profiles enable row level security;
alter table onboarding_tasks enable row level security;

drop policy if exists "Users can read own profile" on profiles;
create policy "Users can read own profile"
on profiles for select
using (id = auth.uid() or is_super_admin());

drop policy if exists "Super admins can manage profiles" on profiles;
create policy "Super admins can manage profiles"
on profiles for all
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "Super admins can manage onboarding tasks" on onboarding_tasks;
create policy "Super admins can manage onboarding tasks"
on onboarding_tasks for all
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "Restaurant admins can read onboarding tasks" on onboarding_tasks;
create policy "Restaurant admins can read onboarding tasks"
on onboarding_tasks for select
using (is_restaurant_member(onboarding_tasks.restaurant_id));

drop policy if exists "Super admins can manage all restaurants" on restaurants;
create policy "Super admins can manage all restaurants"
on restaurants for all
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "Public can read active restaurants" on restaurants;
create policy "Public can read active restaurants"
on restaurants for select
using (
  is_active = true
  and status in ('live', 'trial', 'paid')
);

drop policy if exists "Super admins can manage all categories" on menu_categories;
create policy "Super admins can manage all categories"
on menu_categories for all
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "Super admins can manage all menu items" on menu_items;
create policy "Super admins can manage all menu items"
on menu_items for all
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "Super admins can manage all orders" on orders;
create policy "Super admins can manage all orders"
on orders for all
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "Super admins can manage all customers" on customers;
create policy "Super admins can manage all customers"
on customers for all
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "Super admins can manage restaurant users" on restaurant_users;
create policy "Super admins can manage restaurant users"
on restaurant_users for all
using (is_super_admin())
with check (is_super_admin());

drop policy if exists "Restaurant owners can update own restaurants" on restaurants;
drop policy if exists "Restaurant admins can update own restaurants" on restaurants;
create policy "Restaurant admins can update own restaurants"
on restaurants for update
using (is_restaurant_member(restaurants.id, array['restaurant_admin', 'owner', 'manager']))
with check (is_restaurant_member(restaurants.id, array['restaurant_admin', 'owner', 'manager']));

drop policy if exists "Restaurant users can manage own categories" on menu_categories;
create policy "Restaurant users can manage own categories"
on menu_categories for all
using (is_restaurant_member(menu_categories.restaurant_id, array['restaurant_admin', 'owner', 'manager', 'staff']))
with check (is_restaurant_member(menu_categories.restaurant_id, array['restaurant_admin', 'owner', 'manager', 'staff']));

drop policy if exists "Restaurant users can manage own menu items" on menu_items;
create policy "Restaurant users can manage own menu items"
on menu_items for all
using (is_restaurant_member(menu_items.restaurant_id, array['restaurant_admin', 'owner', 'manager', 'staff']))
with check (is_restaurant_member(menu_items.restaurant_id, array['restaurant_admin', 'owner', 'manager', 'staff']));

drop policy if exists "Restaurant users can manage own orders" on orders;
create policy "Restaurant users can manage own orders"
on orders for all
using (is_restaurant_member(orders.restaurant_id, array['restaurant_admin', 'owner', 'manager', 'staff']))
with check (is_restaurant_member(orders.restaurant_id, array['restaurant_admin', 'owner', 'manager', 'staff']));

drop policy if exists "Restaurant users can manage own customers" on customers;
create policy "Restaurant users can manage own customers"
on customers for all
using (is_restaurant_member(customers.restaurant_id, array['restaurant_admin', 'owner', 'manager', 'staff']))
with check (is_restaurant_member(customers.restaurant_id, array['restaurant_admin', 'owner', 'manager', 'staff']));

-- Existing pilots remain available after adding the new status field.
update restaurants
set status = 'live',
    plan = case when plan = 'trial' then 'trial' else plan end
where is_active = true
  and status = 'draft';

insert into onboarding_tasks (restaurant_id, task_key, task_label, is_completed, completed_at)
select
  restaurants.id,
  task.task_key,
  task.task_label,
  case
    when task.task_key = 'restaurant_details' then true
    when task.task_key = 'whatsapp_number' then restaurants.whatsapp_number <> ''
    when task.task_key = 'restaurant_live' then restaurants.status = 'live'
    else false
  end,
  case
    when task.task_key = 'restaurant_details' then now()
    when task.task_key = 'whatsapp_number' and restaurants.whatsapp_number <> '' then now()
    when task.task_key = 'restaurant_live' and restaurants.status = 'live' then now()
    else null
  end
from restaurants
cross join (
  values
    ('restaurant_details', 'Restaurant details added'),
    ('whatsapp_number', 'WhatsApp number added'),
    ('menu_uploaded', 'Menu uploaded or imported'),
    ('categories_created', 'Categories created'),
    ('items_added', 'Items added'),
    ('images_added', 'Images added'),
    ('fulfilment_settings', 'Delivery and pickup settings added'),
    ('qr_generated', 'QR code generated'),
    ('test_order', 'Test order completed'),
    ('restaurant_live', 'Restaurant live')
) as task(task_key, task_label)
on conflict (restaurant_id, task_key) do nothing;

-- After creating your Supabase Auth user, promote it with:
-- update profiles set role = 'super_admin' where email = 'you@example.com';
