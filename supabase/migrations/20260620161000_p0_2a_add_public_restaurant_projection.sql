-- WhatsOrder P0-2a: add the safe public restaurant projection
-- Run after 20260620_p1_pilot_operations.sql and before deploying the P0-2 app.
--
-- This phase is additive. The existing public table policy remains available
-- until the application has been deployed to use get_public_restaurant.

create or replace function public.is_public_restaurant(
  target_restaurant_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $is_public_restaurant$
  select exists (
    select 1
    from public.restaurants
    where id = target_restaurant_id
      and is_active = true
      and status in ('live', 'trial', 'paid')
  );
$is_public_restaurant$;

revoke all on function public.is_public_restaurant(uuid)
from public, anon, authenticated;
grant execute on function public.is_public_restaurant(uuid)
to anon, authenticated, service_role;

create or replace function public.get_public_restaurant(
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
  opening_hours jsonb
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
    restaurant.opening_hours
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

-- Rollback consideration:
-- These functions are additive and can remain in place if the app deployment
-- is rolled back. Do not run the enforcement phase until the app uses the RPC.
