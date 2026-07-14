-- WhatsOrder Billing Engine — Phase 1 (manual-first / concierge)
--
-- Tracks, per tenant: which plan they're on (entitlement), what they owe
-- (invoices) and what they've paid (payments) — and derives one access status
-- the app reads to gate features gracefully.
--
-- Scope (Phase 1): data model + state machine + idempotent daily cron support +
-- super-admin billing screen + graceful entitlement enforcement. NO payment
-- gateway, NO auto-charge, NO automated dunning, NO proration. VAT fields are
-- carried at zero (WhatsOrder is the issuer and not VAT-registered yet).
--
-- Conventions mirror the existing codebase: uuid PKs (gen_random_uuid()),
-- money as numeric(10,2), created_at/updated_at as timestamptz default now(),
-- every tenant-owned table carries restaurant_id + an RLS policy. All writes go
-- through the service-role server actions / cron; authenticated JWT access is
-- read-only and tenant-scoped via is_restaurant_member()/is_super_admin().

-- ---------------------------------------------------------------------------
-- Enums (idempotent, mirroring the order_status enum pattern in schema.sql)
-- ---------------------------------------------------------------------------
do $billing_enums$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum (
      'trialing',
      'active',
      'past_due',
      'suspended',
      'cancelled'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type public.invoice_status as enum (
      'draft',
      'issued',
      'paid',
      'void'
    );
  end if;
end;
$billing_enums$;

-- Recipient TRN for the tenant on the WhatsOrder → tenant invoice. Blank until
-- the tenant provides one; the issuer TRN lives in env/config, not the DB.
alter table public.restaurants
add column if not exists tenant_trn text;

-- ---------------------------------------------------------------------------
-- plans — catalog (super-admin managed, world-readable)
-- ---------------------------------------------------------------------------
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  name_ar text,
  monthly_price numeric(10, 2) not null check (monthly_price >= 0),
  currency text not null default 'AED',
  max_branches integer check (max_branches is null or max_branches > 0),
  max_staff integer check (max_staff is null or max_staff > 0),
  features jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- subscriptions — one per tenant, source of truth for entitlement
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete restrict,
  status public.subscription_status not null default 'trialing',
  billing_cycle_start date not null,
  billing_cycle_end date not null,
  trial_ends_at timestamptz,
  grace_until date,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_cycle_order check (billing_cycle_end >= billing_cycle_start),
  -- Allow tenant-consistent FKs from invoices (mirrors the p0_4 pattern).
  constraint subscriptions_id_restaurant_unique unique (id, restaurant_id)
);

create index if not exists idx_subscriptions_status_cycle_end
on public.subscriptions(status, billing_cycle_end);

create index if not exists idx_subscriptions_grace_until
on public.subscriptions(grace_until)
where grace_until is not null;

-- ---------------------------------------------------------------------------
-- invoices — one per subscription per period
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  subscription_id uuid not null,
  invoice_number text not null unique,
  period_start date not null,
  period_end date not null,
  subtotal numeric(10, 2) not null default 0 check (subtotal >= 0),
  vat_rate numeric(5, 2) not null default 0 check (vat_rate >= 0),
  vat_amount numeric(10, 2) not null default 0 check (vat_amount >= 0),
  total numeric(10, 2) not null default 0 check (total >= 0),
  currency text not null default 'AED',
  status public.invoice_status not null default 'draft',
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  -- {subscription_id}:{period_start} — blocks the cron from double-issuing.
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_period_order check (period_end >= period_start),
  constraint invoices_subscription_tenant_fkey
    foreign key (subscription_id, restaurant_id)
    references public.subscriptions(id, restaurant_id)
    on delete cascade,
  constraint invoices_id_restaurant_unique unique (id, restaurant_id)
);

create index if not exists idx_invoices_restaurant_created
on public.invoices(restaurant_id, created_at desc);

create index if not exists idx_invoices_subscription
on public.invoices(subscription_id);

-- Aging scan: issued invoices past their due date.
create index if not exists idx_invoices_status_due
on public.invoices(status, due_at)
where status = 'issued';

-- ---------------------------------------------------------------------------
-- invoice_line_items — itemised so add-ons / per-branch charges drop in later
--
-- restaurant_id is denormalised here (the brief table omits it) so the table
-- follows the project rule that every tenant-owned table carries restaurant_id
-- and a simple tenant-scoped RLS policy, and so the tenant-consistent FK can be
-- enforced against the parent invoice.
-- ---------------------------------------------------------------------------
create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  invoice_id uuid not null,
  description text not null,
  description_ar text,
  quantity integer not null default 1 check (quantity > 0),
  unit_amount numeric(10, 2) not null check (unit_amount >= 0),
  line_total numeric(10, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  constraint invoice_line_items_invoice_tenant_fkey
    foreign key (invoice_id, restaurant_id)
    references public.invoices(id, restaurant_id)
    on delete cascade
);

create index if not exists idx_invoice_line_items_invoice
on public.invoice_line_items(invoice_id);

-- ---------------------------------------------------------------------------
-- payments — money received, recorded by hand in Phase 1
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  invoice_id uuid not null,
  amount numeric(10, 2) not null check (amount > 0),
  method text not null check (method in ('bank_transfer', 'cash', 'cheque', 'other')),
  reference text,
  received_at timestamptz not null default now(),
  recorded_by_user_id uuid,
  created_at timestamptz not null default now(),
  constraint payments_invoice_tenant_fkey
    foreign key (invoice_id, restaurant_id)
    references public.invoices(id, restaurant_id)
    on delete cascade
);

create index if not exists idx_payments_invoice
on public.payments(invoice_id);

create index if not exists idx_payments_restaurant_received
on public.payments(restaurant_id, received_at desc);

-- ---------------------------------------------------------------------------
-- subscription_status_events — audit trail (mirrors order_status_events)
-- Every status change is recorded so billing disputes are traceable.
-- ---------------------------------------------------------------------------
create table if not exists public.subscription_status_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  subscription_id uuid not null,
  from_status public.subscription_status,
  to_status public.subscription_status not null,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscription_status_events_sub_created
on public.subscription_status_events(restaurant_id, subscription_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Invoice numbering — gapless, zero-padded, resets each calendar year.
-- Format: WO-{YYYY}-{NNNN}. A counter row per year is incremented atomically;
-- callers (cron / issue action) take the next number as part of inserting the
-- invoice, so each successful issue consumes exactly one sequential number.
-- ---------------------------------------------------------------------------
create table if not exists public.billing_invoice_counters (
  year integer primary key,
  last_value integer not null default 0
);

create or replace function public.next_invoice_number(p_year integer)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $next_invoice_number$
declare
  v_value integer;
begin
  insert into public.billing_invoice_counters as c (year, last_value)
  values (p_year, 1)
  on conflict (year)
  do update set last_value = c.last_value + 1
  returning c.last_value into v_value;

  return 'WO-' || p_year::text || '-' || lpad(v_value::text, 4, '0');
end;
$next_invoice_number$;

-- ---------------------------------------------------------------------------
-- Cached convenience: keep restaurants.plan mirrored from the subscription's
-- plan. subscriptions is the source of truth; restaurants.plan is just a cache.
-- ---------------------------------------------------------------------------
create or replace function public.sync_restaurant_plan_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $sync_restaurant_plan$
declare
  v_code text;
begin
  select code into v_code from public.plans where id = new.plan_id;

  if v_code is not null then
    update public.restaurants
    set plan = v_code,
        updated_at = now()
    where id = new.restaurant_id
      and plan is distinct from v_code;
  end if;

  return new;
end;
$sync_restaurant_plan$;

drop trigger if exists subscriptions_sync_restaurant_plan on public.subscriptions;
create trigger subscriptions_sync_restaurant_plan
after insert or update of plan_id on public.subscriptions
for each row execute function public.sync_restaurant_plan_from_subscription();

-- updated_at maintenance (reuses the shared trigger function).
drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — read-only, tenant-scoped JWT access; writes service-role.
-- ---------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.payments enable row level security;
alter table public.subscription_status_events enable row level security;

-- Internal counter table: no policies, so RLS denies all JWT access outright.
-- It is only ever touched by the security-definer next_invoice_number() (runs
-- as owner) and the service role (bypasses RLS). RLS-on + zero policies is the
-- fail-closed posture this project mandates.
alter table public.billing_invoice_counters enable row level security;

-- plans: world-readable active catalog; super admins see retired plans too.
drop policy if exists "Active plans are world readable" on public.plans;
create policy "Active plans are world readable"
on public.plans for select
using (is_active or public.is_super_admin());

-- subscriptions
drop policy if exists "Restaurant members can read own subscription" on public.subscriptions;
create policy "Restaurant members can read own subscription"
on public.subscriptions for select
using (public.is_restaurant_member(subscriptions.restaurant_id));

drop policy if exists "Super admins can read all subscriptions" on public.subscriptions;
create policy "Super admins can read all subscriptions"
on public.subscriptions for select
using (public.is_super_admin());

-- invoices
drop policy if exists "Restaurant members can read own invoices" on public.invoices;
create policy "Restaurant members can read own invoices"
on public.invoices for select
using (public.is_restaurant_member(invoices.restaurant_id));

drop policy if exists "Super admins can read all invoices" on public.invoices;
create policy "Super admins can read all invoices"
on public.invoices for select
using (public.is_super_admin());

-- invoice_line_items
drop policy if exists "Restaurant members can read own invoice line items" on public.invoice_line_items;
create policy "Restaurant members can read own invoice line items"
on public.invoice_line_items for select
using (public.is_restaurant_member(invoice_line_items.restaurant_id));

drop policy if exists "Super admins can read all invoice line items" on public.invoice_line_items;
create policy "Super admins can read all invoice line items"
on public.invoice_line_items for select
using (public.is_super_admin());

-- payments
drop policy if exists "Restaurant members can read own payments" on public.payments;
create policy "Restaurant members can read own payments"
on public.payments for select
using (public.is_restaurant_member(payments.restaurant_id));

drop policy if exists "Super admins can read all payments" on public.payments;
create policy "Super admins can read all payments"
on public.payments for select
using (public.is_super_admin());

-- subscription_status_events
drop policy if exists "Restaurant members can read own status events" on public.subscription_status_events;
create policy "Restaurant members can read own status events"
on public.subscription_status_events for select
using (public.is_restaurant_member(subscription_status_events.restaurant_id));

drop policy if exists "Super admins can read all status events" on public.subscription_status_events;
create policy "Super admins can read all status events"
on public.subscription_status_events for select
using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Grants — strip inherited privileges, then grant only the required reads.
-- Writes happen exclusively through the service-role client (no grants below).
-- ---------------------------------------------------------------------------
revoke all on table public.plans from anon, authenticated;
revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.invoices from anon, authenticated;
revoke all on table public.invoice_line_items from anon, authenticated;
revoke all on table public.payments from anon, authenticated;
revoke all on table public.subscription_status_events from anon, authenticated;
revoke all on table public.billing_invoice_counters from anon, authenticated;

-- Plans are world-readable so the public-facing pricing/entitlement can resolve.
grant select on table public.plans to anon, authenticated;

-- Tenant-scoped read access for authenticated JWTs (RLS narrows to own rows).
grant select on table public.subscriptions to authenticated;
grant select on table public.invoices to authenticated;
grant select on table public.invoice_line_items to authenticated;
grant select on table public.payments to authenticated;
grant select on table public.subscription_status_events to authenticated;

-- Invoice numbering is service-role only; never callable from the browser.
revoke all on function public.next_invoice_number(integer) from public, anon, authenticated;
grant execute on function public.next_invoice_number(integer) to service_role;

revoke all on function public.sync_restaurant_plan_from_subscription()
from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed the Phase 1 plan catalog (idempotent on code).
-- ---------------------------------------------------------------------------
insert into public.plans (code, name, name_ar, monthly_price, max_branches, max_staff, features)
values
  (
    'starter', 'Starter', 'المبتدئ', 99.00, 1, 3,
    '{"campaigns": false, "advanced_analytics": false, "scheduled_orders": false, "multi_branch": false}'::jsonb
  ),
  (
    'pro', 'Pro', 'المحترف', 249.00, 1, 10,
    '{"campaigns": true, "advanced_analytics": true, "scheduled_orders": true, "multi_branch": false}'::jsonb
  ),
  (
    'multi_branch', 'Multi-branch', 'متعدد الفروع', 499.00, null, 50,
    '{"campaigns": true, "advanced_analytics": true, "scheduled_orders": true, "multi_branch": true, "group_reporting": true, "shared_menu": true}'::jsonb
  )
on conflict (code) do update set
  name = excluded.name,
  name_ar = excluded.name_ar,
  monthly_price = excluded.monthly_price,
  max_branches = excluded.max_branches,
  max_staff = excluded.max_staff,
  features = excluded.features,
  is_active = true,
  updated_at = now();

notify pgrst, 'reload schema';
