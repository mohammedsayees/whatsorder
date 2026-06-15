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
  created_at timestamptz not null default now()
);

create table if not exists menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
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
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  customer_name text not null,
  customer_phone text not null,
  delivery_area text not null,
  delivery_address text not null,
  notes text,
  payment_method payment_method not null,
  items jsonb not null,
  subtotal numeric(10, 2) not null check (subtotal >= 0),
  delivery_fee numeric(10, 2) not null check (delivery_fee >= 0),
  total numeric(10, 2) not null check (total >= 0),
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
  total_orders integer not null default 0,
  total_spend numeric(10, 2) not null default 0,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, phone)
);

create table if not exists restaurant_users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  unique (restaurant_id, email)
);

create index if not exists idx_menu_categories_restaurant on menu_categories(restaurant_id);
create index if not exists idx_menu_items_restaurant on menu_items(restaurant_id);
create index if not exists idx_orders_restaurant_created on orders(restaurant_id, created_at desc);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_customers_restaurant_phone on customers(restaurant_id, phone);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

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

drop policy if exists "Public can read active restaurants" on restaurants;
create policy "Public can read active restaurants"
on restaurants for select
using (is_active = true);

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

drop policy if exists "Public can read menu items for active restaurants" on menu_items;
create policy "Public can read menu items for active restaurants"
on menu_items for select
using (
  exists (
    select 1 from restaurants
    where restaurants.id = menu_items.restaurant_id
    and restaurants.is_active = true
  )
);

-- Admin and write operations are intentionally performed through server actions with SUPABASE_SERVICE_ROLE_KEY.
-- Add user-scoped RLS policies here when restaurant_users is connected to Supabase Auth.

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
  'Chaixpress',
  'chaixpress',
  null,
  '971551150068',
  'Al Rawdha 3 , Ajman, UAE',
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
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'Tea & Drinks', 1, true),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'Burgers', 2, true),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'Rolls & Fries', 3, true),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 'Combos', 4, true)
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
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Karak Tea', 'Signature hot karak tea.', 1, null, true, true),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'Zinger Burger', 'Crispy zinger chicken burger with house sauce.', 15, null, true, true),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'Double Smash Burger', 'Double smashed beef patty burger with cheese.', 21, null, true, true),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'Single Smash Burger', 'Single smashed beef patty burger with cheese.', 15, null, true, false),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000102', 'Grill Chicken Burger', 'Grilled chicken burger with fresh toppings.', 15, null, true, false),
  ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'Classic Porotta Roll', 'Classic porotta roll with house filling.', 7, null, true, false),
  ('00000000-0000-4000-8000-000000000207', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'Oman Chips Porotta', 'Porotta filled with Oman Chips.', 3, null, true, false),
  ('00000000-0000-4000-8000-000000000208', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000103', 'Chicken Loaded Fries', 'Loaded fries topped with chicken and sauce.', 16, null, true, false),
  ('00000000-0000-4000-8000-000000000209', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000101', 'Fresh Lime Juice', 'Chilled fresh lime juice.', 8, null, true, false),
  ('00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000104', 'Zinger Combo', 'Zinger burger combo meal.', 21, null, true, true)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  image_url = excluded.image_url,
  is_available = excluded.is_available,
  is_featured = excluded.is_featured;
