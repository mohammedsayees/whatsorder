-- First-occurrence onboarding funnel milestones. Events contain no customer
-- PII and are written only by service-role server code.

create table if not exists public.onboarding_funnel_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  event_name text not null check (event_name in (
    'demo_built',
    'menu_reviewed',
    'claim_viewed',
    'restaurant_claimed',
    'dashboard_opened',
    'test_order_started',
    'test_order_accepted',
    'qr_opened'
  )),
  event_source text not null default 'app' check (
    char_length(event_source) between 1 and 40
  ),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
  ),
  occurred_at timestamptz not null default now(),
  unique (restaurant_id, event_name)
);

create index if not exists onboarding_funnel_events_occurred_at_idx
  on public.onboarding_funnel_events (occurred_at desc);

alter table public.onboarding_funnel_events enable row level security;

drop policy if exists "Restaurant members can read onboarding funnel events"
  on public.onboarding_funnel_events;
create policy "Restaurant members can read onboarding funnel events"
  on public.onboarding_funnel_events
  for select
  using (
    public.is_restaurant_member(restaurant_id)
    or public.is_super_admin()
  );

revoke all on table public.onboarding_funnel_events from public, anon, authenticated;
grant select on table public.onboarding_funnel_events to authenticated;
grant all on table public.onboarding_funnel_events to service_role;

comment on table public.onboarding_funnel_events is
  'First occurrence of each restaurant onboarding milestone; no customer PII.';
