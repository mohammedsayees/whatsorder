-- WhatsOrder: optional delivery-radius enforcement
--
-- Adds restaurant coordinates and an opt-in delivery radius. All columns are
-- nullable and default NULL, so a restaurant with no radius set (including the
-- live Chai Xpress pilot) behaves exactly as before — delivery is unlimited.
--
-- Coordinates are set manually in admin (free map-pin / lat-lng input); there is
-- no geocoding API. The customer's location comes from the existing browser GPS
-- capture and is only used to validate the order, never persisted here.

alter table public.restaurants
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists delivery_radius_km numeric(6, 2);

comment on column public.restaurants.latitude is
  'Restaurant location latitude (manual, optional). Used with delivery_radius_km to gate delivery.';
comment on column public.restaurants.longitude is
  'Restaurant location longitude (manual, optional). Used with delivery_radius_km to gate delivery.';
comment on column public.restaurants.delivery_radius_km is
  'Optional delivery radius in km. NULL = no limit (default). When set with coordinates, delivery orders outside the radius are rejected.';

-- The public customer path reads restaurants only through this security-definer
-- projection (the base table is not readable by anon/authenticated). Recreate it
-- to expose the three new fields so the customer checkout and the server-side
-- order action can run the distance check. Owner/internal columns stay excluded.
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
  delivery_radius_km numeric
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
    restaurant.delivery_radius_km
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
