-- Office group orders: one organiser shares a link, colleagues add their
-- items under a first name, the organiser locks the group and checks out
-- once (organiser pays for everyone).
--
-- Privacy: joiners give only a first name (no phone). Names are tenant
-- scoped and only appear in the restaurant's own order notes. Groups expire
-- after two hours and old groups are deleted by the application.
--
-- Writes: service role only, through /api/group-orders routes that check the
-- unguessable share token (anyone with the link) and, for lock/checkout, the
-- organiser's secret (stored here only as a SHA-256 hash). No anon or
-- authenticated write privileges or policies.

create table if not exists public.group_carts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  share_token text not null unique check (share_token ~ '^[A-Za-z0-9_-]{22,64}$'),
  organiser_token_hash text not null check (organiser_token_hash ~ '^[0-9a-f]{64}$'),
  organiser_name text not null check (char_length(organiser_name) between 1 and 30),
  status text not null default 'open' check (status in ('open', 'locked', 'ordered')),
  order_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  constraint group_carts_id_restaurant_unique unique (id, restaurant_id),
  constraint group_carts_order_tenant_fkey
    foreign key (order_id, restaurant_id)
    references public.orders(id, restaurant_id)
    on delete set null (order_id)
);

create table if not exists public.group_cart_lines (
  id uuid primary key default gen_random_uuid(),
  group_cart_id uuid not null,
  restaurant_id uuid not null,
  participant_id text not null check (participant_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  participant_name text not null check (char_length(participant_name) between 1 and 30),
  line jsonb not null check (jsonb_typeof(line) = 'object'),
  created_at timestamptz not null default now(),
  -- A line always belongs to the same restaurant as its group.
  constraint group_cart_lines_cart_tenant_fkey
    foreign key (group_cart_id, restaurant_id)
    references public.group_carts(id, restaurant_id)
    on delete cascade
);

create index if not exists idx_group_carts_restaurant_created
on public.group_carts(restaurant_id, created_at desc);

create index if not exists idx_group_cart_lines_cart_created
on public.group_cart_lines(group_cart_id, created_at);

alter table public.group_carts enable row level security;
alter table public.group_cart_lines enable row level security;

drop policy if exists "Tenant members can read group carts" on public.group_carts;
create policy "Tenant members can read group carts"
on public.group_carts
for select
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

drop policy if exists "Tenant members can read group cart lines" on public.group_cart_lines;
create policy "Tenant members can read group cart lines"
on public.group_cart_lines
for select
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

revoke all on table public.group_carts from anon, authenticated;
revoke all on table public.group_cart_lines from anon, authenticated;
grant select on table public.group_carts to authenticated;
grant select on table public.group_cart_lines to authenticated;
