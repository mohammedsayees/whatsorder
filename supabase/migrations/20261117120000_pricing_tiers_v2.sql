-- WhatsOrder pricing v2 (Nov 2026): Starter / Growth / Personalised.
--
--   * Starter      AED 149 / mo, AED 1,490 / yr (2 months free), 10 AI images / mo
--   * Growth       AED 299 / mo, AED 2,990 / yr — plan code stays `pro`
--   * Personalised from AED 599 / mo, AED 5,990 / yr — plan code stays `multi_branch`;
--                  extra branches and custom terms go through price_override.
--
-- New plan flags: chat_inbox (WhatsApp inbox + AI auto-reply) and finance.
-- Campaigns (marketing, posters, sends) already had a flag. Riders stay on
-- every plan. New plan column monthly_ai_image_limit (null = no monthly cap;
-- the existing per-day caps still apply).
--
-- Grandfathering: every subscription that exists when this runs keeps
--   (a) the price it pays today, pinned via price_override (audited in
--       subscription_price_events), and
--   (b) every feature, via the new subscriptions.feature_overrides column.
-- A super admin can remove either later. No RLS or policy changes.

alter table public.plans
add column if not exists monthly_ai_image_limit integer;

do $plan_ai_limit_constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'plans_monthly_ai_image_limit_nonnegative'
      and conrelid = 'public.plans'::regclass
  ) then
    alter table public.plans
    add constraint plans_monthly_ai_image_limit_nonnegative
    check (monthly_ai_image_limit is null or monthly_ai_image_limit >= 0);
  end if;
end;
$plan_ai_limit_constraint$;

alter table public.subscriptions
add column if not exists feature_overrides jsonb not null default '{}'::jsonb;

do $feature_overrides_constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subscriptions_feature_overrides_object'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
    add constraint subscriptions_feature_overrides_object
    check (jsonb_typeof(feature_overrides) = 'object');
  end if;
end;
$feature_overrides_constraint$;

comment on column public.subscriptions.feature_overrides is
  'Per-contract entitlement overrides merged over the plan: boolean plan flags, plus optional monthly_ai_image_limit (number, or null for no monthly cap).';

-- (0) restaurants.plan mirrors the subscription's plan code (sync trigger),
--     but its check never allowed 'multi_branch', so assigning that plan
--     failed. Allow it so Personalised contracts can be created.
alter table public.restaurants drop constraint if exists restaurants_plan_check;
alter table public.restaurants
add constraint restaurants_plan_check
check (plan in ('trial', 'starter', 'growth', 'pro', 'multi_branch', 'custom'));

-- (1) Grandfather prices: pin today's price on every live subscription that is
--     not already on an active override. Runs before the plan prices change.
with grandfathered as (
  update public.subscriptions subscription
  set
    price_override = case subscription.billing_interval
      when 'yearly' then plan.annual_price
      else plan.monthly_price
    end,
    price_override_reason = 'Grandfathered: pre-November 2026 pricing',
    price_override_ends_at = null,
    price_override_created_by = null,
    price_override_updated_at = now()
  from public.plans plan
  where plan.id = subscription.plan_id
    and subscription.status <> 'cancelled'
    and (
      subscription.price_override is null
      or (
        subscription.price_override_ends_at is not null
        and subscription.price_override_ends_at < current_date
      )
    )
  returning subscription.id, subscription.restaurant_id,
    subscription.billing_interval, subscription.price_override
)
insert into public.subscription_price_events (
  restaurant_id, subscription_id, previous_price, new_price,
  billing_interval, reason, ends_at, actor_user_id, actor_role
)
select
  restaurant_id, id, null, price_override,
  billing_interval, 'Grandfathered: pre-November 2026 pricing', null, null, 'migration'
from grandfathered;

-- (2) Grandfather features: existing subscriptions keep everything.
update public.subscriptions
set feature_overrides = feature_overrides || jsonb_build_object(
  'campaigns', true,
  'advanced_analytics', true,
  'scheduled_orders', true,
  'chat_inbox', true,
  'finance', true,
  'monthly_ai_image_limit', null
)
where status <> 'cancelled';

-- (3) New plan prices, names, flags and AI allowances.
update public.plans
set
  name = 'Starter',
  name_ar = 'المبتدئ',
  monthly_price = 149.00,
  annual_price = 1490.00,
  max_branches = 1,
  max_staff = 3,
  monthly_ai_image_limit = 10,
  features = coalesce(features, '{}'::jsonb) || jsonb_build_object(
    'campaigns', false,
    'advanced_analytics', false,
    'scheduled_orders', false,
    'multi_branch', false,
    'group_reporting', false,
    'shared_menu', false,
    'chat_inbox', false,
    'finance', false
  ),
  updated_at = now()
where code = 'starter';

update public.plans
set
  name = 'Growth',
  name_ar = 'النمو',
  monthly_price = 299.00,
  annual_price = 2990.00,
  max_branches = 1,
  max_staff = 10,
  monthly_ai_image_limit = 100,
  features = coalesce(features, '{}'::jsonb) || jsonb_build_object(
    'campaigns', true,
    'advanced_analytics', true,
    'scheduled_orders', true,
    'multi_branch', false,
    'group_reporting', false,
    'shared_menu', false,
    'chat_inbox', true,
    'finance', true
  ),
  updated_at = now()
where code = 'pro';

update public.plans
set
  name = 'Personalised',
  name_ar = 'مخصص',
  monthly_price = 599.00,
  annual_price = 5990.00,
  max_branches = null,
  max_staff = 50,
  monthly_ai_image_limit = 300,
  features = coalesce(features, '{}'::jsonb) || jsonb_build_object(
    'campaigns', true,
    'advanced_analytics', true,
    'scheduled_orders', true,
    'multi_branch', true,
    'group_reporting', true,
    'shared_menu', true,
    'chat_inbox', true,
    'finance', true
  ),
  updated_at = now()
where code = 'multi_branch';

-- Self-check: no live subscription's billed price changed.
do $pricing_v2_verify$
begin
  if exists (
    select 1 from public.subscriptions
    where status <> 'cancelled'
      and price_override is null
  ) then
    raise exception 'pricing v2: a live subscription was left without a pinned price';
  end if;
end;
$pricing_v2_verify$;
