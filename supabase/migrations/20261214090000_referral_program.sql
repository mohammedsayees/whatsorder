-- Referral program ("share the café, both get points").
--
-- Flow: a signed-in customer shares /r/<slug>?src=ref-<code>. The visit's `src`
-- already lands on orders.attribution_source (20261116140000). When the friend's
-- FIRST order at that café is Completed, both customers earn points. Points are a
-- ledger separate from the stamp card (customers.loyalty_points_balance) so they
-- never fill a stamp card. 100 points (configurable) redeem into a one-time
-- personal voucher using the existing promo_codes / promo_code_assignments rules,
-- so server-side order re-pricing is untouched.
--
-- Everything is tenant-scoped (restaurant_id), writes are service-role / trigger
-- only, and the award trigger can never block an order from completing.
--
-- Apply BEFORE merging the code that uses it (migration-first).

-- ── Per-restaurant settings (the café funds the rewards, so the café tunes them)
alter table public.restaurants
  add column if not exists referral_enabled boolean not null default false,
  add column if not exists referral_points_each integer not null default 20,
  add column if not exists referral_redeem_points integer not null default 100,
  add column if not exists referral_reward_value numeric(10, 2) not null default 5,
  add column if not exists referral_min_order numeric(10, 2) not null default 0;

do $referral_settings_checks$
begin
  if not exists (select 1 from pg_constraint where conname = 'restaurants_referral_points_each_check') then
    alter table public.restaurants
      add constraint restaurants_referral_points_each_check
      check (referral_points_each between 1 and 1000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurants_referral_redeem_points_check') then
    alter table public.restaurants
      add constraint restaurants_referral_redeem_points_check
      check (referral_redeem_points between 1 and 100000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurants_referral_reward_value_check') then
    alter table public.restaurants
      add constraint restaurants_referral_reward_value_check
      check (referral_reward_value > 0 and referral_reward_value <= 1000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'restaurants_referral_min_order_check') then
    alter table public.restaurants
      add constraint restaurants_referral_min_order_check
      check (referral_min_order >= 0);
  end if;
end
$referral_settings_checks$;

-- ── Each customer's shareable code (lazy; unique per café)
alter table public.customers
  add column if not exists referral_code text;

do $referral_code_check$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_referral_code_format') then
    alter table public.customers
      add constraint customers_referral_code_format
      check (referral_code is null or referral_code ~ '^[a-z0-9]{4,12}$');
  end if;
end
$referral_code_check$;

create unique index if not exists customers_restaurant_referral_code_key
on public.customers(restaurant_id, referral_code)
where referral_code is not null;

-- ── Rewarded referrals (one row per friend: they can only be referred once)
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  referrer_customer_id uuid not null,
  referred_customer_id uuid not null,
  order_id uuid not null,
  points_each integer not null check (points_each > 0),
  created_at timestamptz not null default now(),
  constraint referrals_referrer_tenant_fkey
    foreign key (referrer_customer_id, restaurant_id)
    references public.customers(id, restaurant_id) on delete cascade,
  constraint referrals_referred_tenant_fkey
    foreign key (referred_customer_id, restaurant_id)
    references public.customers(id, restaurant_id) on delete cascade,
  constraint referrals_order_tenant_fkey
    foreign key (order_id, restaurant_id)
    references public.orders(id, restaurant_id) on delete cascade,
  constraint referrals_not_self check (referrer_customer_id <> referred_customer_id),
  constraint referrals_referred_once unique (referred_customer_id)
);

create index if not exists idx_referrals_restaurant_referrer
on public.referrals(restaurant_id, referrer_customer_id);

-- ── Points ledger: balance = sum(points) (earned > 0, redeemed < 0)
create table if not exists public.referral_point_transactions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null,
  referral_id uuid references public.referrals(id) on delete restrict,
  type text not null check (type in ('earned', 'redeemed')),
  points integer not null check (points <> 0),
  promo_code text,
  created_at timestamptz not null default now(),
  constraint referral_point_transactions_customer_tenant_fkey
    foreign key (customer_id, restaurant_id)
    references public.customers(id, restaurant_id) on delete cascade,
  constraint referral_point_transactions_sign check (
    (type = 'earned' and points > 0) or (type = 'redeemed' and points < 0)
  )
);

-- A referral credits each side at most once.
create unique index if not exists referral_point_transactions_earned_once
on public.referral_point_transactions(referral_id, customer_id)
where type = 'earned';

create index if not exists idx_referral_point_transactions_customer
on public.referral_point_transactions(restaurant_id, customer_id);

alter table public.referrals enable row level security;
alter table public.referral_point_transactions enable row level security;

drop policy if exists "Read referrals (managers, super admins)" on public.referrals;
create policy "Read referrals (managers, super admins)"
on public.referrals
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id, array['restaurant_admin', 'owner', 'manager'])
  or public.is_super_admin()
);

drop policy if exists "Read referral points (managers, super admins)"
on public.referral_point_transactions;
create policy "Read referral points (managers, super admins)"
on public.referral_point_transactions
for select
to authenticated
using (
  public.is_restaurant_member(restaurant_id, array['restaurant_admin', 'owner', 'manager'])
  or public.is_super_admin()
);

revoke all on table public.referrals from anon, authenticated;
revoke all on table public.referral_point_transactions from anon, authenticated;
grant select on table public.referrals to authenticated;
grant select on table public.referral_point_transactions to authenticated;

-- ── Award points when the referred friend's first order is Completed
-- A separate trigger (not an edit of the order-status functions) so existing
-- completion logic is untouched. Any failure here is swallowed with a warning:
-- a referral problem must never stop staff completing an order.
create or replace function public.award_referral_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  settings public.restaurants%rowtype;
  v_code text;
  v_referrer uuid;
  v_referred uuid;
  v_referral uuid;
begin
  begin
    if new.attribution_source is null
       or new.attribution_source !~ '^ref-[a-z0-9]{4,12}$' then
      return new;
    end if;

    select * into settings from public.restaurants where id = new.restaurant_id;
    if not found or not settings.referral_enabled then
      return new;
    end if;
    if coalesce(new.total, 0) < settings.referral_min_order then
      return new;
    end if;

    v_code := substr(new.attribution_source, 5);

    select id into v_referrer
    from public.customers
    where restaurant_id = new.restaurant_id and referral_code = v_code;

    select id into v_referred
    from public.customers
    where restaurant_id = new.restaurant_id and phone = new.customer_phone;

    -- Unknown code, unknown friend, or someone referring themselves.
    if v_referrer is null or v_referred is null or v_referrer = v_referred then
      return new;
    end if;

    -- The friend must be new: no earlier, non-cancelled order at this café.
    if exists (
      select 1
      from public.orders earlier
      where earlier.restaurant_id = new.restaurant_id
        and earlier.customer_phone = new.customer_phone
        and earlier.id <> new.id
        and earlier.status <> 'Cancelled'
        and earlier.created_at < new.created_at
    ) then
      return new;
    end if;

    insert into public.referrals (
      restaurant_id, referrer_customer_id, referred_customer_id, order_id, points_each
    )
    values (
      new.restaurant_id, v_referrer, v_referred, new.id, settings.referral_points_each
    )
    on conflict (referred_customer_id) do nothing
    returning id into v_referral;

    if v_referral is null then
      return new;
    end if;

    insert into public.referral_point_transactions (
      restaurant_id, customer_id, referral_id, type, points
    )
    values
      (new.restaurant_id, v_referrer, v_referral, 'earned', settings.referral_points_each),
      (new.restaurant_id, v_referred, v_referral, 'earned', settings.referral_points_each);
  exception when others then
    raise warning 'award_referral_points failed for order %: %', new.id, sqlerrm;
  end;

  return new;
end;
$function$;

revoke all on function public.award_referral_points() from public, anon, authenticated;

drop trigger if exists orders_award_referral_points on public.orders;
create trigger orders_award_referral_points
after update of status on public.orders
for each row
when (new.status = 'Completed' and old.status is distinct from 'Completed')
execute function public.award_referral_points();

-- ── The signed-in customer's shareable code (created on first use)
create or replace function public.get_or_create_referral_code(
  p_restaurant_id uuid,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  settings public.restaurants%rowtype;
  v_customer public.customers%rowtype;
  v_candidate text;
  v_attempt integer := 0;
begin
  select * into settings from public.restaurants where id = p_restaurant_id;
  if not found or not settings.referral_enabled then
    return jsonb_build_object('enabled', false);
  end if;

  select * into v_customer
  from public.customers
  where restaurant_id = p_restaurant_id
    and phone = public.normalize_customer_phone(p_phone);

  -- No customers row yet (never ordered): nothing to attribute a reward to.
  if not found then
    return jsonb_build_object('enabled', true, 'code', null);
  end if;

  while v_customer.referral_code is null and v_attempt < 8 loop
    v_attempt := v_attempt + 1;
    v_candidate := substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    begin
      update public.customers
      set referral_code = v_candidate
      where id = v_customer.id and restaurant_id = p_restaurant_id
        and referral_code is null
      returning referral_code into v_customer.referral_code;
    exception when unique_violation then
      null; -- collision within this café: try another
    end;
  end loop;

  -- A concurrent call may have set the code first: read whatever is stored.
  select referral_code into v_customer.referral_code
  from public.customers
  where id = v_customer.id and restaurant_id = p_restaurant_id;

  return jsonb_build_object(
    'enabled', true,
    'code', v_customer.referral_code,
    'points_each', settings.referral_points_each
  );
end;
$function$;

-- ── Account summary: balance and what it can buy
create or replace function public.get_referral_summary(
  p_restaurant_id uuid,
  p_phone text
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'enabled', r.referral_enabled,
    'points_each', r.referral_points_each,
    'redeem_points', r.referral_redeem_points,
    'reward_value', r.referral_reward_value,
    'balance', coalesce((
      select sum(t.points)
      from public.referral_point_transactions t
      join public.customers c
        on c.id = t.customer_id and c.restaurant_id = t.restaurant_id
      where t.restaurant_id = p_restaurant_id
        and c.phone = public.normalize_customer_phone(p_phone)
    ), 0)::integer
  )
  from public.restaurants r
  where r.id = p_restaurant_id;
$function$;

-- ── Redeem: points → a one-time personal voucher (30 days)
create or replace function public.redeem_referral_points(
  p_restaurant_id uuid,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  settings public.restaurants%rowtype;
  v_customer public.customers%rowtype;
  v_balance integer;
  v_code text;
  v_promo_id uuid;
  v_attempt integer := 0;
  v_ends_at timestamptz := now() + interval '30 days';
begin
  select * into settings from public.restaurants where id = p_restaurant_id;
  if not found then
    raise exception 'Restaurant not found';
  end if;

  -- Lock the customer row so two taps cannot spend the same points twice.
  select * into v_customer
  from public.customers
  where restaurant_id = p_restaurant_id
    and phone = public.normalize_customer_phone(p_phone)
  for update;
  if not found then
    raise exception 'Not enough points';
  end if;

  select coalesce(sum(points), 0) into v_balance
  from public.referral_point_transactions
  where restaurant_id = p_restaurant_id and customer_id = v_customer.id;

  if v_balance < settings.referral_redeem_points then
    raise exception 'Not enough points';
  end if;

  while v_promo_id is null and v_attempt < 8 loop
    v_attempt := v_attempt + 1;
    v_code := 'REF' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    begin
      insert into public.promo_codes (
        restaurant_id, code, description, discount_type, discount_value,
        min_subtotal, ends_at, max_redemptions, max_redemptions_per_customer,
        is_active, audience
      )
      values (
        p_restaurant_id, v_code, 'Referral points reward', 'fixed',
        settings.referral_reward_value, 0, v_ends_at, 1, 1, true, 'assigned'
      )
      returning id into v_promo_id;
    exception when unique_violation then
      null;
    end;
  end loop;

  if v_promo_id is null then
    raise exception 'Could not create the reward. Please try again.';
  end if;

  insert into public.promo_code_assignments (restaurant_id, promo_code_id, customer_id)
  values (p_restaurant_id, v_promo_id, v_customer.id);

  insert into public.referral_point_transactions (
    restaurant_id, customer_id, type, points, promo_code
  )
  values (
    p_restaurant_id, v_customer.id, 'redeemed',
    -settings.referral_redeem_points, v_code
  );

  return jsonb_build_object(
    'code', v_code,
    'value', settings.referral_reward_value,
    'ends_at', v_ends_at,
    'balance', v_balance - settings.referral_redeem_points
  );
end;
$function$;

revoke all on function public.get_or_create_referral_code(uuid, text)
  from public, anon, authenticated;
revoke all on function public.get_referral_summary(uuid, text)
  from public, anon, authenticated;
revoke all on function public.redeem_referral_points(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_or_create_referral_code(uuid, text) to service_role;
grant execute on function public.get_referral_summary(uuid, text) to service_role;
grant execute on function public.redeem_referral_points(uuid, text) to service_role;
