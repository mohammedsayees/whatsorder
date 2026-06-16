create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum (
      'New',
      'Accepted',
      'Preparing',
      'Out for Delivery',
      'Completed',
      'Cancelled'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type payment_method as enum (
      'Cash on Delivery',
      'Card on Delivery'
    );
  end if;
end $$;

create table if not exists restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  whatsapp_number text not null,
  address text,
  delivery_fee numeric(10, 2) not null default 0,
  minimum_order_amount numeric(10, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id uuid not null references menu_categories(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10, 2) not null check (price >= 0),
  image_url text,
  is_available boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  delivery_area text not null,
  delivery_address text not null,
  delivery_latitude numeric(10, 7),
  delivery_longitude numeric(10, 7),
  delivery_google_maps_url text,
  delivery_place_id text,
  delivery_address_text text,
  delivery_landmark text,
  notes text,
  payment_method payment_method not null,
  items jsonb not null,
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  delivery_fee numeric(10, 2) not null check (delivery_fee >= 0),
  total numeric(10, 2) not null check (total >= 0),
  points_earned integer not null default 0,
  points_redeemed integer not null default 0,
  loyalty_discount numeric(10, 2) not null default 0,
  status order_status not null default 'New',
  whatsapp_message text not null,
  consent_order_processing boolean not null,
  consent_marketing boolean not null default false,
  consent_timestamp timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  phone text not null,
  delivery_area text not null,
  delivery_address text not null,
  default_latitude numeric(10, 7),
  default_longitude numeric(10, 7),
  default_google_maps_url text,
  default_address_text text,
  default_landmark text,
  total_orders integer not null default 0,
  total_spend numeric(10, 2) not null default 0,
  last_order_at timestamptz,
  marketing_opt_in boolean not null default false,
  consent_order_processing boolean not null default false,
  consent_marketing boolean not null default false,
  consent_timestamp timestamptz,
  loyalty_points_balance integer not null default 0,
  lifetime_points_earned integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, phone)
);

create table if not exists restaurant_users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  user_id uuid,
  email text not null,
  role text not null check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  unique (restaurant_id, email)
);

create table if not exists loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  order_id uuid references orders(id) on delete set null,
  type text not null check (type in ('earned', 'redeemed', 'adjusted', 'expired')),
  points integer not null,
  description text,
  created_at timestamptz not null default now()
);

alter table restaurants add column if not exists updated_at timestamptz not null default now();
alter table menu_categories add column if not exists updated_at timestamptz not null default now();
alter table menu_items add column if not exists updated_at timestamptz not null default now();
alter table orders add column if not exists delivery_latitude numeric(10, 7);
alter table orders add column if not exists delivery_longitude numeric(10, 7);
alter table orders add column if not exists delivery_google_maps_url text;
alter table orders add column if not exists delivery_place_id text;
alter table orders add column if not exists delivery_address_text text;
alter table orders add column if not exists delivery_landmark text;
alter table orders add column if not exists points_earned integer not null default 0;
alter table orders add column if not exists points_redeemed integer not null default 0;
alter table orders add column if not exists loyalty_discount numeric(10, 2) not null default 0;
alter table customers add column if not exists default_latitude numeric(10, 7);
alter table customers add column if not exists default_longitude numeric(10, 7);
alter table customers add column if not exists default_google_maps_url text;
alter table customers add column if not exists default_address_text text;
alter table customers add column if not exists default_landmark text;
alter table customers add column if not exists last_order_at timestamptz;
alter table customers add column if not exists consent_order_processing boolean not null default false;
alter table customers add column if not exists consent_marketing boolean not null default false;
alter table customers add column if not exists consent_timestamp timestamptz;
alter table customers add column if not exists loyalty_points_balance integer not null default 0;
alter table customers add column if not exists lifetime_points_earned integer not null default 0;
alter table restaurant_users add column if not exists user_id uuid;

create index if not exists idx_menu_categories_restaurant on menu_categories(restaurant_id);
create index if not exists idx_menu_items_restaurant on menu_items(restaurant_id);
create index if not exists idx_orders_restaurant_created on orders(restaurant_id, created_at desc);
create index if not exists idx_orders_restaurant_customer_phone on orders(restaurant_id, customer_phone);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_customers_restaurant_phone on customers(restaurant_id, phone);
create index if not exists idx_loyalty_transactions_restaurant_customer on loyalty_transactions(restaurant_id, customer_id);
create index if not exists idx_restaurant_users_user on restaurant_users(user_id);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function is_restaurant_member(
  target_restaurant_id uuid,
  allowed_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from restaurant_users
    where restaurant_users.restaurant_id = target_restaurant_id
    and restaurant_users.user_id = auth.uid()
    and (
      allowed_roles is null
      or restaurant_users.role = any(allowed_roles)
    )
  );
$$;

drop trigger if exists restaurants_set_updated_at on restaurants;
create trigger restaurants_set_updated_at
before update on restaurants
for each row execute function set_updated_at();

drop trigger if exists menu_categories_set_updated_at on menu_categories;
create trigger menu_categories_set_updated_at
before update on menu_categories
for each row execute function set_updated_at();

drop trigger if exists menu_items_set_updated_at on menu_items;
create trigger menu_items_set_updated_at
before update on menu_items
for each row execute function set_updated_at();

drop trigger if exists orders_set_updated_at on orders;
create trigger orders_set_updated_at
before update on orders
for each row execute function set_updated_at();

drop trigger if exists customers_set_updated_at on customers;
create trigger customers_set_updated_at
before update on customers
for each row execute function set_updated_at();

alter table restaurants enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table orders enable row level security;
alter table customers enable row level security;
alter table restaurant_users enable row level security;
alter table loyalty_transactions enable row level security;

drop policy if exists "Public can read active restaurants" on restaurants;
create policy "Public can read active restaurants"
on restaurants for select
using (is_active = true);

drop policy if exists "Restaurant users can read own restaurants" on restaurants;
create policy "Restaurant users can read own restaurants"
on restaurants for select
using (is_restaurant_member(restaurants.id));

drop policy if exists "Restaurant owners can update own restaurants" on restaurants;
create policy "Restaurant owners can update own restaurants"
on restaurants for update
using (is_restaurant_member(restaurants.id, array['owner', 'manager']))
with check (is_restaurant_member(restaurants.id, array['owner', 'manager']));

drop policy if exists "Public can read active categories" on menu_categories;
create policy "Public can read active categories"
on menu_categories for select
using (
  is_active = true
  and exists (
    select 1 from restaurants
    where restaurants.id = menu_categories.restaurant_id
    and restaurants.is_active = true
  )
);

drop policy if exists "Restaurant users can manage own categories" on menu_categories;
create policy "Restaurant users can manage own categories"
on menu_categories for all
using (is_restaurant_member(menu_categories.restaurant_id, array['owner', 'manager', 'staff']))
with check (is_restaurant_member(menu_categories.restaurant_id, array['owner', 'manager', 'staff']));

drop policy if exists "Public can read menu items for active restaurants" on menu_items;
create policy "Public can read menu items for active restaurants"
on menu_items for select
using (
  is_available = true
  and
  exists (
    select 1 from restaurants
    where restaurants.id = menu_items.restaurant_id
    and restaurants.is_active = true
  )
);

drop policy if exists "Restaurant users can manage own menu items" on menu_items;
create policy "Restaurant users can manage own menu items"
on menu_items for all
using (is_restaurant_member(menu_items.restaurant_id, array['owner', 'manager', 'staff']))
with check (is_restaurant_member(menu_items.restaurant_id, array['owner', 'manager', 'staff']));

drop policy if exists "Public can insert new orders" on orders;
create policy "Public can insert new orders"
on orders for insert
with check (
  status = 'New'
  and consent_order_processing = true
  and exists (
    select 1 from restaurants
    where restaurants.id = orders.restaurant_id
    and restaurants.is_active = true
  )
);

drop policy if exists "Restaurant users can manage own orders" on orders;
create policy "Restaurant users can manage own orders"
on orders for all
using (is_restaurant_member(orders.restaurant_id, array['owner', 'manager', 'staff']))
with check (is_restaurant_member(orders.restaurant_id, array['owner', 'manager', 'staff']));

drop policy if exists "Restaurant users can manage own customers" on customers;
create policy "Restaurant users can manage own customers"
on customers for all
using (is_restaurant_member(customers.restaurant_id, array['owner', 'manager', 'staff']))
with check (is_restaurant_member(customers.restaurant_id, array['owner', 'manager', 'staff']));

drop policy if exists "Restaurant users can manage own loyalty transactions" on loyalty_transactions;
create policy "Restaurant users can manage own loyalty transactions"
on loyalty_transactions for all
using (is_restaurant_member(loyalty_transactions.restaurant_id, array['owner', 'manager', 'staff']))
with check (is_restaurant_member(loyalty_transactions.restaurant_id, array['owner', 'manager', 'staff']));

drop policy if exists "Restaurant users can read own memberships" on restaurant_users;
create policy "Restaurant users can read own memberships"
on restaurant_users for select
using (user_id = auth.uid());

drop policy if exists "Restaurant owners can manage own users" on restaurant_users;
create policy "Restaurant owners can manage own users"
on restaurant_users for all
using (is_restaurant_member(restaurant_users.restaurant_id, array['owner']))
with check (is_restaurant_member(restaurant_users.restaurant_id, array['owner']));

-- The app currently writes orders, customers, menu edits, and settings through server actions
-- with SUPABASE_SERVICE_ROLE_KEY. The user-scoped policies above are ready for Supabase Auth.

insert into restaurants (
  id,
  name,
  slug,
  logo_url,
  whatsapp_number,
  address,
  delivery_fee,
  minimum_order_amount,
  is_active
)
values (
  '00000000-0000-4000-8000-000000000001',
  'Chai Xpress',
  'chaixpress',
  null,
  '971551150068',
  'Al Rawda 3, Ajman, UAE',
  5,
  15,
  true
)
on conflict (slug) do update set
  name = excluded.name,
  whatsapp_number = excluded.whatsapp_number,
  address = excluded.address,
  delivery_fee = excluded.delivery_fee,
  minimum_order_amount = excluded.minimum_order_amount,
  is_active = excluded.is_active;

delete from menu_items
where restaurant_id = '00000000-0000-4000-8000-000000000001';

delete from menu_categories
where restaurant_id = '00000000-0000-4000-8000-000000000001';

insert into menu_categories (id, restaurant_id, name, display_order, is_active)
values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Tea & Hot Drinks', 1, true),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'Shawarma', 2, true),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'Burgers', 3, true),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 'Sandwiches & Rolls', 4, true),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000001', 'Snacks', 5, true),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000001', 'Juices', 6, true),
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000001', 'Combos', 7, true)
on conflict (id) do update set
  name = excluded.name,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into menu_items (
  id,
  restaurant_id,
  category_id,
  name,
  description,
  price,
  image_url,
  is_available,
  is_featured
)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Karak Tea', 'Signature hot karak tea.', 2, null, true, true),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Sulaimani Tea', 'Light black tea served hot.', 1, null, true, false),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Ginger Tea', 'Hot tea with ginger.', 2, null, true, false),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Zafran Tea', 'Saffron-flavoured hot tea.', 3, null, true, false),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'Chicken Shawarma', 'Classic chicken shawarma wrap.', 6, null, true, true),
  ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'Spicy Chicken Shawarma', 'Chicken shawarma with spicy sauce.', 7, null, true, false),
  ('00000000-0000-4000-8000-000000000207', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'Shawarma Plate', 'Chicken shawarma served as a plate.', 15, null, true, false),
  ('00000000-0000-4000-8000-000000000208', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'Zinger Burger', 'Crispy zinger chicken burger with house sauce.', 12, null, true, true),
  ('00000000-0000-4000-8000-000000000209', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'Chicken Burger', 'Classic chicken burger.', 8, null, true, false),
  ('00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'Beef Burger', 'Classic beef burger.', 10, null, true, false),
  ('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'Double Zinger Burger', 'Double crispy zinger chicken burger.', 16, null, true, true),
  ('00000000-0000-4000-8000-000000000212', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000104', 'Porotta Roll', 'Classic porotta roll with house filling.', 7, null, true, false),
  ('00000000-0000-4000-8000-000000000213', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000104', 'Oman Chips Porotta', 'Porotta filled with Oman Chips.', 5, null, true, false),
  ('00000000-0000-4000-8000-000000000214', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000104', 'Chicken Club Sandwich', 'Layered chicken club sandwich.', 12, null, true, false),
  ('00000000-0000-4000-8000-000000000215', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000105', 'Loaded Fries', 'Fries topped with chicken, cheese, and sauce.', 12, null, true, false),
  ('00000000-0000-4000-8000-000000000216', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000105', 'French Fries', 'Crispy fried potato fries.', 6, null, true, false),
  ('00000000-0000-4000-8000-000000000217', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000105', 'Chicken Nuggets', 'Crispy chicken nuggets.', 10, null, true, false),
  ('00000000-0000-4000-8000-000000000218', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000106', 'Fresh Lime Juice', 'Chilled fresh lime juice.', 8, null, true, false),
  ('00000000-0000-4000-8000-000000000219', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000106', 'Orange Juice', 'Fresh orange juice.', 10, null, true, false),
  ('00000000-0000-4000-8000-000000000220', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000106', 'Avocado Juice', 'Creamy avocado juice.', 12, null, true, false),
  ('00000000-0000-4000-8000-000000000221', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000107', 'Shawarma + Karak Combo', 'Chicken shawarma with karak tea.', 7, null, true, true),
  ('00000000-0000-4000-8000-000000000222', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000107', 'Zinger Burger + Fries + Karak', 'Zinger burger combo with fries and karak.', 18, null, true, true),
  ('00000000-0000-4000-8000-000000000223', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000107', '3 Shawarma Offer', 'Three chicken shawarmas.', 12, null, true, true)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  image_url = excluded.image_url,
  is_available = excluded.is_available,
  is_featured = excluded.is_featured;
