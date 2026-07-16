-- WhatsOrder: instant demo stores (self-serve "menu photo -> live store" funnel)
--
-- Adds the demo-tenant flag and expiry to restaurants, and republishes the
-- public restaurant projection so the customer PWA can render demo banners
-- and the simulated-checkout notice. Demo tenants are created only by the
-- service-role server action; RLS is untouched.

alter table public.restaurants
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_expires_at timestamptz,
  add column if not exists demo_ip_hash text;

comment on column public.restaurants.is_demo is
  'True for self-serve instant demo stores. Excluded from operational crons and purged after demo_expires_at.';
comment on column public.restaurants.demo_ip_hash is
  'Salted hash of the creating IP, used only to rate-limit demo builds. Never stores the raw IP.';

-- Cleanup cron scans for expired demos; partial index keeps it cheap.
create index if not exists restaurants_demo_expiry_idx
  on public.restaurants (demo_expires_at)
  where is_demo = true;

-- Republish the public projection with the demo fields appended.
drop function if exists public.get_public_restaurant(text);

create function public.get_public_restaurant(
  target_slug text
)
returns table (
  id uuid,
  name text,
  name_ar text,
  slug text,
  logo_url text,
  cover_image_url text,
  whatsapp_number text,
  address text,
  city text,
  subtitle text,
  address_ar text,
  subtitle_ar text,
  delivery_fee numeric,
  minimum_order_amount numeric,
  pickup_enabled boolean,
  car_pickup_enabled boolean,
  dine_in_enabled boolean,
  delivery_enabled boolean,
  scheduled_orders_enabled boolean,
  public_reviews_enabled boolean,
  accepting_orders boolean,
  opening_hours_enabled boolean,
  opening_hours jsonb,
  latitude double precision,
  longitude double precision,
  delivery_radius_km numeric,
  country_code text,
  currency_code text,
  locale text,
  time_zone text,
  phone_country_code text,
  is_demo boolean,
  demo_expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $get_public_restaurant$
  select
    restaurant.id,
    restaurant.name,
    restaurant.name_ar,
    restaurant.slug,
    restaurant.logo_url,
    restaurant.cover_image_url,
    restaurant.whatsapp_number,
    restaurant.address,
    restaurant.city,
    restaurant.subtitle,
    restaurant.address_ar,
    restaurant.subtitle_ar,
    restaurant.delivery_fee,
    restaurant.minimum_order_amount,
    restaurant.pickup_enabled,
    restaurant.car_pickup_enabled,
    restaurant.dine_in_enabled,
    restaurant.delivery_enabled,
    restaurant.scheduled_orders_enabled,
    restaurant.public_reviews_enabled,
    restaurant.accepting_orders,
    restaurant.opening_hours_enabled,
    restaurant.opening_hours,
    restaurant.latitude,
    restaurant.longitude,
    restaurant.delivery_radius_km,
    restaurant.country_code,
    restaurant.currency_code,
    restaurant.locale,
    restaurant.time_zone,
    restaurant.phone_country_code,
    restaurant.is_demo,
    restaurant.demo_expires_at
  from public.restaurants restaurant
  where restaurant.slug = trim(target_slug)
    and public.is_public_restaurant(restaurant.id)
  limit 1;
$get_public_restaurant$;

revoke all on function public.get_public_restaurant(text)
from public, anon, authenticated;
grant execute on function public.get_public_restaurant(text)
to anon, authenticated, service_role;
