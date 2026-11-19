-- Stripe Connect: each restaurant's own Stripe account (a v2 connected
-- account with the merchant configuration, direct charges, Stripe-collected
-- fees and Stripe-owned loss liability). Customers pay the restaurant
-- directly; WhatsOrder never holds restaurant funds.
--
-- One row per restaurant. Written only by the service role from the admin
-- "Online payments" settings (owner / restaurant admin). Tenant members can
-- read their own row. No anon or authenticated write privileges.

create table if not exists public.restaurant_stripe_accounts (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  stripe_account_id text not null unique check (stripe_account_id ~ '^acct_[A-Za-z0-9]{8,64}$'),
  livemode boolean not null,
  -- configuration.merchant.capabilities.card_payments.status from Stripe.
  card_payments_status text not null default 'pending'
    check (card_payments_status in ('active', 'pending', 'restricted', 'unsupported')),
  -- True while Stripe still needs information from the restaurant.
  requirements_due boolean not null default true,
  status_checked_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restaurant_stripe_accounts enable row level security;

drop policy if exists restaurant_stripe_accounts_tenant_read on public.restaurant_stripe_accounts;
create policy restaurant_stripe_accounts_tenant_read
on public.restaurant_stripe_accounts for select to authenticated
using (public.is_restaurant_member(restaurant_id) or public.is_super_admin());

revoke all on table public.restaurant_stripe_accounts from public, anon, authenticated;
grant select on table public.restaurant_stripe_accounts to authenticated;
grant all on table public.restaurant_stripe_accounts to service_role;

comment on table public.restaurant_stripe_accounts is
  'Restaurant-owned Stripe connected account for online order payments (direct charges).';
