-- Personal vouchers: promo codes only chosen customers can redeem.
--
-- promo_codes.audience: 'everyone' (default, today's behaviour) or 'assigned'.
-- An assigned code may only be redeemed by customers listed in
-- promo_code_assignments for the same restaurant. Enforcement is a trigger on
-- promo_code_redemptions: create_order_with_customer_v6 inserts the
-- redemption in the same transaction as the order, so a refused redemption
-- rolls the whole order back. v6 itself is NOT changed.
--
-- get_promo_code_usage additionally reports customer_assigned (for a friendly
-- checkout message), and get_customer_vouchers additionally lists a
-- customer's assigned codes (always visible to their recipients).
--
-- Writes to promo_code_assignments happen only through owner/manager server
-- actions with the service role, scoped to the session's restaurant. Tenant
-- consistency is enforced by composite FKs to promo_codes and customers.

begin;

alter table public.promo_codes
  add column if not exists audience text not null default 'everyone';

do $audience_check$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.promo_codes'::regclass
      and conname = 'promo_codes_audience_check'
  ) then
    alter table public.promo_codes
      add constraint promo_codes_audience_check
      check (audience in ('everyone', 'assigned'));
  end if;
end
$audience_check$;

create table if not exists public.promo_code_assignments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  promo_code_id uuid not null,
  customer_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint promo_code_assignments_code_tenant_fkey
    foreign key (promo_code_id, restaurant_id)
    references public.promo_codes(id, restaurant_id)
    on delete cascade,
  constraint promo_code_assignments_customer_tenant_fkey
    foreign key (customer_id, restaurant_id)
    references public.customers(id, restaurant_id)
    on delete cascade,
  constraint promo_code_assignments_code_customer_key unique (promo_code_id, customer_id)
);

create index if not exists idx_promo_code_assignments_restaurant_customer
on public.promo_code_assignments(restaurant_id, customer_id);

alter table public.promo_code_assignments enable row level security;

drop policy if exists "Read promo code assignments (managers, super admins)"
on public.promo_code_assignments;
create policy "Read promo code assignments (managers, super admins)"
on public.promo_code_assignments
for select
to authenticated
using (
  public.is_restaurant_member(
    restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
  or public.is_super_admin()
);

revoke all on table public.promo_code_assignments from anon, authenticated;
grant select on table public.promo_code_assignments to authenticated;

-- ── Enforcement ─────────────────────────────────────────────────────────────
create or replace function public.enforce_promo_code_audience()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  if exists (
    select 1 from public.promo_codes promo
    where promo.id = new.promo_code_id
      and promo.restaurant_id = new.restaurant_id
      and promo.audience = 'assigned'
  ) and not exists (
    select 1
    from public.promo_code_assignments assignment
    join public.customers customer
      on customer.id = assignment.customer_id
     and customer.restaurant_id = assignment.restaurant_id
    where assignment.promo_code_id = new.promo_code_id
      and assignment.restaurant_id = new.restaurant_id
      and customer.phone = new.customer_phone
  ) then
    -- Starts with v6's "Promo code is not valid" so the app maps it.
    raise exception 'Promo code is not valid for this customer';
  end if;
  return new;
end;
$function$;

revoke all on function public.enforce_promo_code_audience() from public, anon, authenticated;

drop trigger if exists promo_code_redemptions_enforce_audience on public.promo_code_redemptions;
create trigger promo_code_redemptions_enforce_audience
before insert on public.promo_code_redemptions
for each row execute function public.enforce_promo_code_audience();

-- ── Checkout preview: add customer_assigned (other keys unchanged) ─────────
create or replace function public.get_promo_code_usage(
  target_restaurant_id uuid,
  target_promo_code_id uuid,
  target_phone text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $promo_usage$
  with canonical as (
    select case
      when nullif(btrim(coalesce(target_phone, '')), '') is null then null
      else public.normalize_customer_phone(target_phone)
    end as phone
  ),
  live_redemptions as (
    select redemption.customer_phone
    from public.promo_code_redemptions redemption
    join public.orders redeemed_order
      on redeemed_order.id = redemption.order_id
     and redeemed_order.restaurant_id = redemption.restaurant_id
    where redemption.restaurant_id = target_restaurant_id
      and redemption.promo_code_id = target_promo_code_id
      and redeemed_order.status <> 'Cancelled'
  )
  select jsonb_build_object(
    'total_used', (select count(*) from live_redemptions),
    'customer_used', (
      select count(*) from live_redemptions, canonical
      where live_redemptions.customer_phone = canonical.phone
    ),
    'customer_has_orders', coalesce((
      select exists (
        select 1 from public.orders previous_order, canonical
        where canonical.phone is not null
          and previous_order.restaurant_id = target_restaurant_id
          and previous_order.customer_phone = canonical.phone
          and previous_order.status <> 'Cancelled'
      )
    ), false),
    'customer_assigned', coalesce((
      select exists (
        select 1
        from public.promo_code_assignments assignment
        join public.customers customer
          on customer.id = assignment.customer_id
         and customer.restaurant_id = assignment.restaurant_id,
        canonical
        where canonical.phone is not null
          and assignment.restaurant_id = target_restaurant_id
          and assignment.promo_code_id = target_promo_code_id
          and customer.phone = canonical.phone
      )
    ), false)
  );
$promo_usage$;

revoke all on function public.get_promo_code_usage(uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.get_promo_code_usage(uuid, uuid, text) to service_role;

-- ── Account vouchers: public opted-in codes + this customer's assigned ones ─
create or replace function public.get_customer_vouchers(
  p_restaurant_id uuid,
  p_phone text
)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with canonical as (
    select case
      when nullif(btrim(coalesce(p_phone, '')), '') is null then null
      else public.normalize_customer_phone(p_phone)
    end as phone
  ),
  mine as (
    select assignment.promo_code_id
    from public.promo_code_assignments assignment
    join public.customers customer
      on customer.id = assignment.customer_id
     and customer.restaurant_id = assignment.restaurant_id
    where assignment.restaurant_id = p_restaurant_id
      and customer.phone = (select phone from canonical)
  ),
  candidates as (
    select promo.*, (promo.audience = 'assigned') as personal
    from public.promo_codes promo
    where promo.restaurant_id = p_restaurant_id
      and promo.is_active
      and (promo.starts_at is null or promo.starts_at <= now())
      and (promo.ends_at is null or promo.ends_at > now())
      and (
        (promo.audience = 'everyone' and promo.show_in_account)
        or (promo.audience = 'assigned' and promo.id in (select promo_code_id from mine))
      )
  ),
  usage as (
    select
      redemption.promo_code_id,
      count(*) as total_used,
      count(*) filter (
        where redemption.customer_phone = (select phone from canonical)
      ) as customer_used
    from public.promo_code_redemptions redemption
    join public.orders redeemed_order
      on redeemed_order.id = redemption.order_id
     and redeemed_order.restaurant_id = redemption.restaurant_id
    where redemption.restaurant_id = p_restaurant_id
      and redemption.promo_code_id in (select id from candidates)
      and redeemed_order.status <> 'Cancelled'
    group by redemption.promo_code_id
  ),
  history as (
    select exists (
      select 1
      from public.orders previous_order, canonical
      where canonical.phone is not null
        and previous_order.restaurant_id = p_restaurant_id
        and previous_order.customer_phone = canonical.phone
        and previous_order.status <> 'Cancelled'
    ) as has_orders
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'code', c.code,
        'discount_type', c.discount_type,
        'discount_value', c.discount_value,
        'max_discount', c.max_discount,
        'min_subtotal', c.min_subtotal,
        'ends_at', c.ends_at,
        'first_order_only', c.first_order_only,
        'personal', c.personal,
        'uses_left', case
          when c.max_redemptions_per_customer is null then null
          else c.max_redemptions_per_customer - coalesce(u.customer_used, 0)
        end
      )
      order by c.personal desc, c.ends_at asc nulls last, c.created_at desc
    ),
    '[]'::jsonb
  )
  from candidates c
  left join usage u on u.promo_code_id = c.id
  cross join history h
  cross join canonical
  where canonical.phone is not null
    and (c.max_redemptions is null or coalesce(u.total_used, 0) < c.max_redemptions)
    and (
      c.max_redemptions_per_customer is null
      or coalesce(u.customer_used, 0) < c.max_redemptions_per_customer
    )
    and (not c.first_order_only or not h.has_orders);
$function$;

revoke all on function public.get_customer_vouchers(uuid, text)
  from public, anon, authenticated;
grant execute on function public.get_customer_vouchers(uuid, text) to service_role;

-- ── Self-verification ───────────────────────────────────────────────────────
do $verify_personal_vouchers$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'promo_code_assignments'
      and cmd <> 'SELECT'
  ) then
    raise exception 'promo_code_assignments must not have write policies';
  end if;

  if has_table_privilege('anon', 'public.promo_code_assignments', 'select')
     or has_table_privilege('authenticated', 'public.promo_code_assignments', 'insert')
     or has_table_privilege('authenticated', 'public.promo_code_assignments', 'update')
     or has_table_privilege('authenticated', 'public.promo_code_assignments', 'delete') then
    raise exception 'promo_code_assignments grants are broader than read-only';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.promo_code_redemptions'::regclass
      and tgname = 'promo_code_redemptions_enforce_audience'
      and not tgisinternal
  ) then
    raise exception 'audience enforcement trigger is missing';
  end if;
end
$verify_personal_vouchers$;

commit;
