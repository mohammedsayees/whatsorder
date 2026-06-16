alter table public.orders add column if not exists delivery_latitude numeric(10, 7);
alter table public.orders add column if not exists delivery_longitude numeric(10, 7);
alter table public.orders add column if not exists delivery_google_maps_url text;
alter table public.orders add column if not exists delivery_place_id text;
alter table public.orders add column if not exists delivery_address_text text;
alter table public.orders add column if not exists delivery_landmark text;
alter table public.orders add column if not exists points_earned integer not null default 0;
alter table public.orders add column if not exists points_redeemed integer not null default 0;
alter table public.orders add column if not exists loyalty_discount numeric(10, 2) not null default 0;

alter table public.customers add column if not exists default_latitude numeric(10, 7);
alter table public.customers add column if not exists default_longitude numeric(10, 7);
alter table public.customers add column if not exists default_google_maps_url text;
alter table public.customers add column if not exists default_address_text text;
alter table public.customers add column if not exists default_landmark text;
alter table public.customers add column if not exists last_order_at timestamptz;
alter table public.customers add column if not exists consent_order_processing boolean not null default false;
alter table public.customers add column if not exists consent_marketing boolean not null default false;
alter table public.customers add column if not exists consent_timestamp timestamptz;
alter table public.customers add column if not exists loyalty_points_balance integer not null default 0;
alter table public.customers add column if not exists lifetime_points_earned integer not null default 0;

create table if not exists public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  type text not null check (type in ('earned', 'redeemed', 'adjusted', 'expired')),
  points integer not null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.loyalty_transactions enable row level security;

create index if not exists idx_orders_restaurant_customer_phone
on public.orders(restaurant_id, customer_phone);

create index if not exists idx_customers_restaurant_phone
on public.customers(restaurant_id, phone);

create index if not exists idx_loyalty_transactions_restaurant_customer
on public.loyalty_transactions(restaurant_id, customer_id);

drop policy if exists "Restaurant users can manage own loyalty transactions" on public.loyalty_transactions;
create policy "Restaurant users can manage own loyalty transactions"
on public.loyalty_transactions for all
using (is_restaurant_member(loyalty_transactions.restaurant_id, array['owner', 'manager', 'staff']))
with check (is_restaurant_member(loyalty_transactions.restaurant_id, array['owner', 'manager', 'staff']));

notify pgrst, 'reload schema';
