-- Tenant-level localization for UAE and India. Existing restaurants remain UAE
-- by default; the country profile is constrained so currency, timezone, locale
-- and phone normalization cannot drift into an invalid combination.

alter table public.restaurants
  add column if not exists country_code text not null default 'AE',
  add column if not exists currency_code text not null default 'AED',
  add column if not exists locale text not null default 'en-AE',
  add column if not exists time_zone text not null default 'Asia/Dubai',
  add column if not exists phone_country_code text not null default '971';

alter type public.payment_method add value if not exists 'UPI';

alter table public.restaurants
  drop constraint if exists restaurants_supported_country_profile_check;

alter table public.restaurants
  add constraint restaurants_supported_country_profile_check
  check (
    (
      country_code = 'AE'
      and currency_code = 'AED'
      and locale = 'en-AE'
      and time_zone = 'Asia/Dubai'
      and phone_country_code = '971'
    )
    or
    (
      country_code = 'IN'
      and currency_code = 'INR'
      and locale = 'en-IN'
      and time_zone = 'Asia/Kolkata'
      and phone_country_code = '91'
    )
  ) not valid;

alter table public.restaurants
  validate constraint restaurants_supported_country_profile_check;

comment on column public.restaurants.country_code is
  'Supported tenant country: AE or IN. Drives the constrained localization profile.';
comment on column public.restaurants.currency_code is
  'ISO 4217 display currency for restaurant orders (AED or INR).';
comment on column public.restaurants.locale is
  'BCP 47 formatting locale for restaurant orders (en-AE or en-IN).';
comment on column public.restaurants.time_zone is
  'IANA timezone used for opening hours, operational dates, shifts, and reports.';
comment on column public.restaurants.phone_country_code is
  'Calling code without + used to normalize local customer and WhatsApp numbers.';

-- Public storefronts need localization but not owner, billing, or internal
-- restaurant fields. Recreate the hardened projection with the five safe
-- localization columns appended.
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
  phone_country_code text
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
    restaurant.phone_country_code
  from public.restaurants restaurant
  where restaurant.slug = trim(target_slug)
    and public.is_public_restaurant(restaurant.id)
  limit 1;
$get_public_restaurant$;

revoke all on function public.get_public_restaurant(text)
from public, anon, authenticated;
grant execute on function public.get_public_restaurant(text)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
