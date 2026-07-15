-- WhatsOrder: tenant-scoped customer Web Push subscriptions.
--
-- Subscriptions are written only by service-role API routes after a signed,
-- order-specific authorization cookie is verified. Browser JWTs get no table
-- access. Each row is bound to one restaurant and one customer-created order;
-- marketing is deliberately disabled until a separate push-marketing consent
-- flow is introduced.

create table if not exists public.customer_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  order_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  transactional_enabled boolean not null default true,
  marketing_enabled boolean not null default false,
  marketing_consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  disabled_at timestamptz,
  constraint customer_push_subscriptions_order_tenant_fkey
    foreign key (order_id, restaurant_id)
    references public.orders(id, restaurant_id)
    on delete cascade,
  constraint customer_push_subscriptions_endpoint_length
    check (char_length(endpoint) between 12 and 4096),
  constraint customer_push_subscriptions_marketing_consent
    check (
      (marketing_enabled = false and marketing_consent_at is null)
      or (marketing_enabled = true and marketing_consent_at is not null)
    ),
  unique (restaurant_id, order_id, endpoint)
);

create index if not exists customer_push_subscriptions_order_active_idx
  on public.customer_push_subscriptions (restaurant_id, order_id)
  where transactional_enabled = true and disabled_at is null;

alter table public.customer_push_subscriptions enable row level security;

revoke all on table public.customer_push_subscriptions from anon, authenticated;

do $verify_customer_web_push$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_push_subscriptions'
  ) then
    raise exception 'customer_push_subscriptions must have no RLS policies';
  end if;

  if exists (
    select 1
    from public.customer_push_subscriptions
    where marketing_enabled is true and marketing_consent_at is null
  ) then
    raise exception 'push marketing cannot be enabled without explicit consent';
  end if;
end;
$verify_customer_web_push$;

notify pgrst, 'reload schema';
