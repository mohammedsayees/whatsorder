-- Customer saved addresses (account page phase 2).
--
-- A signed-in customer keeps a small address book PER CAFÉ (PDPL: customer
-- data is per tenant, never shared across restaurants). Each row belongs to
-- one customers row through a tenant-consistent FK, so an address can never
-- point at another restaurant's customer.
--
-- Writes happen only through the service-role RPCs below, called by server
-- actions that resolve (restaurant_id, phone) from the signed customer
-- session. Authenticated dashboard users get read-only access limited to
-- managers of the same restaurant (same rule as public.customers). No
-- anon/authenticated write policy exists.
--
-- Additive: new table + functions only. Existing rows are not touched.

begin;

create table if not exists public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  customer_id uuid not null,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  area text not null default '' check (char_length(area) <= 120),
  building text not null default '' check (char_length(building) <= 120),
  flat text not null default '' check (char_length(flat) <= 60),
  details text not null default '' check (char_length(details) <= 300),
  landmark text not null default '' check (char_length(landmark) <= 250),
  latitude numeric(10, 7) check (latitude between -90 and 90),
  longitude numeric(10, 7) check (longitude between -180 and 180),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_addresses_coordinates_pair
    check ((latitude is null) = (longitude is null)),
  constraint customer_addresses_not_empty
    check (
      btrim(area) <> '' or btrim(building) <> '' or btrim(details) <> ''
      or latitude is not null
    ),
  constraint customer_addresses_customer_tenant_fkey
    foreign key (customer_id, restaurant_id)
    references public.customers(id, restaurant_id)
    on delete cascade
);

create index if not exists idx_customer_addresses_restaurant_customer
on public.customer_addresses(restaurant_id, customer_id);

-- At most one default address per customer.
create unique index if not exists customer_addresses_one_default
on public.customer_addresses(customer_id)
where is_default;

alter table public.customer_addresses enable row level security;

drop policy if exists "Read customer addresses (managers, super admins)"
on public.customer_addresses;
create policy "Read customer addresses (managers, super admins)"
on public.customer_addresses
for select
to authenticated
using (
  public.is_restaurant_member(
    restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
  or public.is_super_admin()
);

revoke all on table public.customer_addresses from anon, authenticated;
grant select on table public.customer_addresses to authenticated;

-- ── Read ────────────────────────────────────────────────────────────────────
create or replace function public.get_customer_addresses(
  p_restaurant_id uuid,
  p_phone text
)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'label', a.label,
        'area', a.area,
        'building', a.building,
        'flat', a.flat,
        'details', a.details,
        'landmark', a.landmark,
        'latitude', a.latitude,
        'longitude', a.longitude,
        'is_default', a.is_default,
        'updated_at', a.updated_at
      )
      order by a.is_default desc, a.updated_at desc
    ),
    '[]'::jsonb
  )
  from public.customer_addresses a
  join public.customers c
    on c.id = a.customer_id
   and c.restaurant_id = a.restaurant_id
  where a.restaurant_id = p_restaurant_id
    and c.restaurant_id = p_restaurant_id
    and c.phone = p_phone;
$function$;

-- ── Create / update ─────────────────────────────────────────────────────────
-- p_address_id null creates (max 10 per customer); otherwise updates the
-- customer's own address. The first address always becomes the default.
create or replace function public.save_customer_address(
  p_restaurant_id uuid,
  p_phone text,
  p_address_id uuid,
  p_label text,
  p_area text,
  p_building text,
  p_flat text,
  p_details text,
  p_landmark text,
  p_latitude numeric,
  p_longitude numeric,
  p_make_default boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_customer_id uuid;
  v_address_id uuid;
  v_count integer;
  v_has_default boolean;
begin
  -- Lock the customer row so concurrent saves serialize (limit + default).
  select c.id into v_customer_id
  from public.customers c
  where c.restaurant_id = p_restaurant_id
    and c.phone = p_phone
  for update;

  if v_customer_id is null then
    return jsonb_build_object('ok', false, 'reason', 'customer_not_found');
  end if;

  if p_address_id is null then
    select count(*) into v_count
    from public.customer_addresses
    where restaurant_id = p_restaurant_id and customer_id = v_customer_id;

    if v_count >= 10 then
      return jsonb_build_object('ok', false, 'reason', 'limit_reached');
    end if;
  end if;

  select exists (
    select 1 from public.customer_addresses
    where restaurant_id = p_restaurant_id
      and customer_id = v_customer_id
      and is_default
      and id is distinct from p_address_id
  ) into v_has_default;

  if coalesce(p_make_default, false) or not v_has_default then
    update public.customer_addresses
    set is_default = false, updated_at = now()
    where restaurant_id = p_restaurant_id
      and customer_id = v_customer_id
      and is_default
      and id is distinct from p_address_id;
  end if;

  begin
    if p_address_id is null then
      insert into public.customer_addresses (
        restaurant_id, customer_id, label, area, building, flat, details,
        landmark, latitude, longitude, is_default
      )
      values (
        p_restaurant_id, v_customer_id, btrim(coalesce(p_label, '')),
        btrim(coalesce(p_area, '')), btrim(coalesce(p_building, '')),
        btrim(coalesce(p_flat, '')), btrim(coalesce(p_details, '')),
        btrim(coalesce(p_landmark, '')), p_latitude, p_longitude,
        coalesce(p_make_default, false) or not v_has_default
      )
      returning id into v_address_id;
    else
      update public.customer_addresses
      set label = btrim(coalesce(p_label, '')),
          area = btrim(coalesce(p_area, '')),
          building = btrim(coalesce(p_building, '')),
          flat = btrim(coalesce(p_flat, '')),
          details = btrim(coalesce(p_details, '')),
          landmark = btrim(coalesce(p_landmark, '')),
          latitude = p_latitude,
          longitude = p_longitude,
          is_default = is_default or coalesce(p_make_default, false) or not v_has_default,
          updated_at = now()
      where id = p_address_id
        and restaurant_id = p_restaurant_id
        and customer_id = v_customer_id
      returning id into v_address_id;

      if v_address_id is null then
        return jsonb_build_object('ok', false, 'reason', 'not_found');
      end if;
    end if;
  exception
    when check_violation or numeric_value_out_of_range then
      return jsonb_build_object('ok', false, 'reason', 'invalid');
  end;

  return jsonb_build_object('ok', true, 'id', v_address_id);
end;
$function$;

-- ── Make default ────────────────────────────────────────────────────────────
create or replace function public.set_default_customer_address(
  p_restaurant_id uuid,
  p_phone text,
  p_address_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_customer_id uuid;
begin
  select c.id into v_customer_id
  from public.customers c
  where c.restaurant_id = p_restaurant_id
    and c.phone = p_phone
  for update;

  if v_customer_id is null or not exists (
    select 1 from public.customer_addresses
    where id = p_address_id
      and restaurant_id = p_restaurant_id
      and customer_id = v_customer_id
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  update public.customer_addresses
  set is_default = false, updated_at = now()
  where restaurant_id = p_restaurant_id
    and customer_id = v_customer_id
    and is_default
    and id <> p_address_id;

  update public.customer_addresses
  set is_default = true, updated_at = now()
  where id = p_address_id
    and restaurant_id = p_restaurant_id
    and customer_id = v_customer_id;

  return jsonb_build_object('ok', true, 'id', p_address_id);
end;
$function$;

-- ── Delete ──────────────────────────────────────────────────────────────────
-- Deleting the default promotes the most recently updated remaining address.
create or replace function public.delete_customer_address(
  p_restaurant_id uuid,
  p_phone text,
  p_address_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_customer_id uuid;
  v_was_default boolean;
begin
  select c.id into v_customer_id
  from public.customers c
  where c.restaurant_id = p_restaurant_id
    and c.phone = p_phone
  for update;

  if v_customer_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  delete from public.customer_addresses
  where id = p_address_id
    and restaurant_id = p_restaurant_id
    and customer_id = v_customer_id
  returning is_default into v_was_default;

  if v_was_default is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_was_default then
    update public.customer_addresses
    set is_default = true, updated_at = now()
    where id = (
      select id from public.customer_addresses
      where restaurant_id = p_restaurant_id and customer_id = v_customer_id
      order by updated_at desc
      limit 1
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.get_customer_addresses(uuid, text)
  from public, anon, authenticated;
revoke all on function public.save_customer_address(
  uuid, text, uuid, text, text, text, text, text, text, numeric, numeric, boolean
) from public, anon, authenticated;
revoke all on function public.set_default_customer_address(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.delete_customer_address(uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function public.get_customer_addresses(uuid, text) to service_role;
grant execute on function public.save_customer_address(
  uuid, text, uuid, text, text, text, text, text, text, numeric, numeric, boolean
) to service_role;
grant execute on function public.set_default_customer_address(uuid, text, uuid)
  to service_role;
grant execute on function public.delete_customer_address(uuid, text, uuid)
  to service_role;

-- ── Self-verification ───────────────────────────────────────────────────────
do $verify_customer_addresses$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_addresses'
      and cmd <> 'SELECT'
  ) then
    raise exception 'customer_addresses must not have write policies';
  end if;

  if has_table_privilege('anon', 'public.customer_addresses', 'select')
     or has_table_privilege('authenticated', 'public.customer_addresses', 'insert')
     or has_table_privilege('authenticated', 'public.customer_addresses', 'update')
     or has_table_privilege('authenticated', 'public.customer_addresses', 'delete') then
    raise exception 'customer_addresses grants are broader than read-only';
  end if;
end
$verify_customer_addresses$;

commit;
