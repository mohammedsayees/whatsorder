-- WhatsOrder: self-serve demo claiming and durable owner activation.
--
-- Raw claim tokens are never persisted. The public server action stores a
-- SHA-256 digest here and calls the service-role-only claim RPC with a digest.

alter table public.restaurants
  add column if not exists activated_at timestamptz,
  add column if not exists activation_order_id uuid;

alter table public.orders
  add column if not exists is_demo boolean not null default false;

update public.orders as orders
set is_demo = true
from public.restaurants as restaurants
where restaurants.id = orders.restaurant_id
  and restaurants.is_demo = true
  and orders.is_demo = false;

create or replace function public.set_order_demo_origin()
returns trigger
language plpgsql
security definer
set search_path = public
as $set_order_demo_origin$
begin
  select coalesce(restaurants.is_demo, false)
  into new.is_demo
  from public.restaurants
  where restaurants.id = new.restaurant_id;

  return new;
end;
$set_order_demo_origin$;

drop trigger if exists orders_set_demo_origin on public.orders;
create trigger orders_set_demo_origin
before insert on public.orders
for each row execute function public.set_order_demo_origin();

revoke all on function public.set_order_demo_origin()
from public, anon, authenticated;

do $activation_order_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'restaurants_activation_order_tenant_fkey'
      and conrelid = 'public.restaurants'::regclass
  ) then
    alter table public.restaurants
      add constraint restaurants_activation_order_tenant_fkey
      foreign key (activation_order_id, id)
      references public.orders(id, restaurant_id)
      on delete set null (activation_order_id);
  end if;
end;
$activation_order_fk$;

create table if not exists public.demo_restaurant_claims (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  claim_token_hash text,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint demo_restaurant_claims_hash_format
    check (claim_token_hash is null or claim_token_hash ~ '^[0-9a-f]{64}$'),
  constraint demo_restaurant_claims_claim_state
    check (
      (claimed_at is null and claim_token_hash is not null)
      or (claimed_at is not null and claim_token_hash is null)
    )
);

create unique index if not exists demo_restaurant_claims_token_hash_unique
on public.demo_restaurant_claims(claim_token_hash)
where claim_token_hash is not null;

alter table public.demo_restaurant_claims enable row level security;
revoke all on table public.demo_restaurant_claims from public, anon, authenticated;

create or replace function public.claim_demo_restaurant(
  target_restaurant_id uuid,
  submitted_claim_token_hash text,
  submitted_owner_email text,
  submitted_whatsapp_number text,
  submitted_country_code text,
  submitted_currency_code text,
  submitted_locale text,
  submitted_phone_country_code text,
  submitted_time_zone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $claim_demo_restaurant$
declare
  normalized_email text := lower(trim(submitted_owner_email));
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
    (claimed_restaurant_id, 'restaurant_live', 'Restaurant live', false, null)
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
  uuid, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.claim_demo_restaurant(
  uuid, text, text, text, text, text, text, text, text
) to service_role;

-- Keep the latest shift-assignment behavior while making first acceptance the
-- atomic activation boundary for a real (non-demo-origin) order.
create or replace function public.transition_order_status_and_record_event(
  target_restaurant_id uuid,
  target_order_id uuid,
  target_status text,
  event_actor_user_id uuid,
  event_actor_role text,
  event_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $transition_and_record$
declare
  previous_status public.order_status;
  updated_order_id uuid;
  active_shift_id uuid;
  activated_restaurant_id uuid;
  activation_time timestamptz := now();
begin
  if target_status = 'Completed' then
    select id
    into active_shift_id
    from public.restaurant_shifts
    where restaurant_id = target_restaurant_id
      and status = 'open'
    for update;
  end if;

  select status
  into previous_status
  from public.orders
  where id = target_order_id
    and restaurant_id = target_restaurant_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  updated_order_id := public.transition_order_status_and_award_loyalty(
    target_restaurant_id,
    target_order_id,
    target_status
  );

  if target_status = 'Accepted' then
    update public.restaurants as restaurants
    set activated_at = activation_time,
        activation_order_id = target_order_id,
        updated_at = activation_time
    where restaurants.id = target_restaurant_id
      and restaurants.is_demo = false
      and restaurants.activated_at is null
      and exists (
        select 1
        from public.orders
        where orders.id = target_order_id
          and orders.restaurant_id = target_restaurant_id
          and orders.is_demo = false
      )
    returning restaurants.id into activated_restaurant_id;

    if activated_restaurant_id is not null then
      update public.onboarding_tasks
      set task_label = 'First order accepted',
          is_completed = true,
          completed_at = activation_time,
          updated_at = activation_time
      where restaurant_id = activated_restaurant_id
        and task_key = 'test_order';
    end if;
  end if;

  if target_status = 'Completed' and active_shift_id is not null then
    update public.orders
    set shift_id = active_shift_id
    where id = target_order_id
      and restaurant_id = target_restaurant_id
      and shift_id is null;
  end if;

  insert into public.order_status_events (
    restaurant_id,
    order_id,
    from_status,
    to_status,
    actor_user_id,
    actor_role,
    reason
  )
  values (
    target_restaurant_id,
    target_order_id,
    previous_status,
    target_status::public.order_status,
    event_actor_user_id,
    nullif(trim(event_actor_role), ''),
    nullif(trim(event_reason), '')
  );

  return updated_order_id;
end;
$transition_and_record$;

revoke all on function public.transition_order_status_and_record_event(
  uuid, uuid, text, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.transition_order_status_and_record_event(
  uuid, uuid, text, uuid, text, text
) to service_role;

do $self_verify$
begin
  if has_table_privilege('anon', 'public.demo_restaurant_claims', 'select')
     or has_table_privilege('authenticated', 'public.demo_restaurant_claims', 'select') then
    raise exception 'demo_restaurant_claims must not be browser-readable';
  end if;

  if has_function_privilege(
    'anon',
    'public.claim_demo_restaurant(uuid,text,text,text,text,text,text,text,text)',
    'execute'
  ) or has_function_privilege(
    'authenticated',
    'public.claim_demo_restaurant(uuid,text,text,text,text,text,text,text,text)',
    'execute'
  ) then
    raise exception 'claim_demo_restaurant must remain service-role only';
  end if;
end;
$self_verify$;

notify pgrst, 'reload schema';
