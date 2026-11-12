-- Self-serve onboarding quick fixes.
--
-- 1. Claiming a demo store now sets the restaurant's permanent store link
--    (slug). Before this, claimed restaurants kept the throwaway
--    "demo-<name>-xxxx" slug on every QR code and poster.
-- 2. A claimed store is live immediately (real WhatsApp number, is_active),
--    so the "Restaurant live" onboarding task is completed at claim instead
--    of staying open forever. Already-claimed restaurants are backfilled.
--
-- Security is unchanged: the function stays security definer, service-role
-- only, and still requires the hashed one-time claim proof.

drop function if exists public.claim_demo_restaurant(
  uuid, text, text, text, text, text, text, text, text
);

create or replace function public.claim_demo_restaurant(
  target_restaurant_id uuid,
  submitted_claim_token_hash text,
  submitted_owner_email text,
  submitted_whatsapp_number text,
  submitted_country_code text,
  submitted_currency_code text,
  submitted_locale text,
  submitted_phone_country_code text,
  submitted_time_zone text,
  submitted_slug text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $claim_demo_restaurant$
declare
  normalized_email text := lower(trim(submitted_owner_email));
  normalized_slug text := lower(trim(coalesce(submitted_slug, '')));
  claimed_restaurant_id uuid;
  starter_plan_id uuid;
  claimed_at_value timestamptz := now();
begin
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid owner email address';
  end if;

  if submitted_claim_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'This claim link is invalid or has expired';
  end if;

  if nullif(trim(submitted_whatsapp_number), '') is null then
    raise exception 'Enter the restaurant WhatsApp number';
  end if;

  -- Same format as src/lib/store-slug.ts: 3-40 chars, lowercase letters,
  -- digits and single hyphens, never the demo- prefix.
  if normalized_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
     or position('--' in normalized_slug) > 0
     or normalized_slug = 'demo'
     or normalized_slug like 'demo-%' then
    raise exception 'Choose a valid store link';
  end if;

  if submitted_country_code not in ('AE', 'IN') then
    raise exception 'Choose a supported country';
  end if;

  -- Serialize claims by normalized email so two demos cannot be claimed by
  -- one owner concurrently. Super Admin promotion remains an explicit bypass.
  perform pg_advisory_xact_lock(hashtextextended(normalized_email, 0));

  if exists (
    select 1
    from public.restaurants
    where id <> target_restaurant_id
      and owner_email is not null
      and lower(owner_email) = normalized_email
      and is_demo = false
  ) or exists (
    select 1
    from public.restaurant_users
    where restaurant_id <> target_restaurant_id
      and lower(email) = normalized_email
  ) then
    raise exception 'This email is already assigned to another restaurant';
  end if;

  select restaurants.id
  into claimed_restaurant_id
  from public.restaurants as restaurants
  join public.demo_restaurant_claims as claims
    on claims.restaurant_id = restaurants.id
  where restaurants.id = target_restaurant_id
    and restaurants.is_demo = true
    and claims.claimed_at is null
    and claims.expires_at > claimed_at_value
    and claims.claim_token_hash = submitted_claim_token_hash
  for update of restaurants, claims;

  if claimed_restaurant_id is null then
    raise exception 'This claim link is invalid or has expired';
  end if;

  if exists (
    select 1
    from public.restaurants
    where slug = normalized_slug
      and id <> claimed_restaurant_id
  ) then
    raise exception 'This store link is already taken';
  end if;

  select id into starter_plan_id
  from public.plans
  where code = 'starter' and is_active = true
  limit 1;

  if starter_plan_id is null then
    raise exception 'The trial plan is not configured';
  end if;

  update public.restaurants
  set
    is_demo = false,
    slug = normalized_slug,
    demo_expires_at = null,
    demo_ip_hash = null,
    whatsapp_number = trim(submitted_whatsapp_number),
    owner_email = normalized_email,
    owner_phone = trim(submitted_whatsapp_number),
    country_code = submitted_country_code,
    currency_code = submitted_currency_code,
    locale = submitted_locale,
    phone_country_code = submitted_phone_country_code,
    time_zone = submitted_time_zone,
    subtitle = null,
    status = 'trial',
    plan = 'trial',
    is_active = true,
    updated_at = claimed_at_value
  where id = claimed_restaurant_id;

  update public.demo_restaurant_claims
  set claim_token_hash = null,
      claimed_at = claimed_at_value
  where restaurant_id = claimed_restaurant_id;

  insert into public.restaurant_users (restaurant_id, email, role)
  values (claimed_restaurant_id, normalized_email, 'restaurant_admin')
  on conflict (restaurant_id, email)
  do update set role = 'restaurant_admin';

  insert into public.onboarding_tasks (
    restaurant_id, task_key, task_label, is_completed, completed_at
  )
  values
    (claimed_restaurant_id, 'restaurant_details', 'Restaurant details added', true, claimed_at_value),
    (claimed_restaurant_id, 'whatsapp_number', 'WhatsApp number added', true, claimed_at_value),
    (claimed_restaurant_id, 'menu_uploaded', 'Menu uploaded or imported', true, claimed_at_value),
    (claimed_restaurant_id, 'categories_created', 'Categories created', true, claimed_at_value),
    (claimed_restaurant_id, 'items_added', 'Items added', true, claimed_at_value),
    (claimed_restaurant_id, 'images_added', 'Images added', false, null),
    (claimed_restaurant_id, 'fulfilment_settings', 'Delivery and pickup settings added', false, null),
    (claimed_restaurant_id, 'qr_generated', 'QR code generated', false, null),
    (claimed_restaurant_id, 'test_order', 'First order accepted', false, null),
    (claimed_restaurant_id, 'restaurant_live', 'Restaurant live', true, claimed_at_value)
  on conflict (restaurant_id, task_key)
  do update set
    task_label = excluded.task_label,
    is_completed = excluded.is_completed,
    completed_at = excluded.completed_at,
    updated_at = claimed_at_value;

  insert into public.subscriptions (
    restaurant_id,
    plan_id,
    status,
    billing_cycle_start,
    billing_cycle_end,
    trial_ends_at
  )
  values (
    claimed_restaurant_id,
    starter_plan_id,
    'trialing',
    current_date,
    current_date + 14,
    claimed_at_value + interval '14 days'
  )
  on conflict (restaurant_id)
  do update set
    plan_id = excluded.plan_id,
    status = 'trialing',
    billing_cycle_start = excluded.billing_cycle_start,
    billing_cycle_end = excluded.billing_cycle_end,
    trial_ends_at = excluded.trial_ends_at,
    grace_until = null,
    cancel_at_period_end = false,
    cancelled_at = null,
    updated_at = claimed_at_value;

  -- The subscription trigger mirrors the starter code. During trial the
  -- restaurant-facing status remains explicitly trial.
  update public.restaurants
  set plan = 'trial', updated_at = claimed_at_value
  where id = claimed_restaurant_id;

  return claimed_restaurant_id;
end;
$claim_demo_restaurant$;

revoke all on function public.claim_demo_restaurant(
  uuid, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.claim_demo_restaurant(
  uuid, text, text, text, text, text, text, text, text, text
) to service_role;

update public.onboarding_tasks as tasks
set is_completed = true,
    completed_at = coalesce(tasks.completed_at, claims.claimed_at, now()),
    updated_at = now()
from public.demo_restaurant_claims as claims
join public.restaurants as restaurants
  on restaurants.id = claims.restaurant_id
where tasks.restaurant_id = claims.restaurant_id
  and tasks.task_key = 'restaurant_live'
  and tasks.is_completed = false
  and claims.claimed_at is not null
  and restaurants.is_demo = false
  and restaurants.is_active = true;
