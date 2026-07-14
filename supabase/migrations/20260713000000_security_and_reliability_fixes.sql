-- WhatsOrder security and restaurant-operations fixes from the July 2026 review.
-- Run after every earlier timestamped migration, including
-- 20260705140000_customer_segments.sql.

-- Password setup is authorized by a short-lived, single-use proof bound to the
-- exact invited membership. The raw proof is kept only in an HttpOnly cookie.
alter table public.restaurant_users
add column if not exists password_setup_token_hash text;

alter table public.restaurant_users
add column if not exists password_setup_expires_at timestamptz;

create unique index if not exists idx_restaurant_users_password_setup_token
on public.restaurant_users(password_setup_token_hash)
where password_setup_token_hash is not null;

-- Repair deployments where the least-privilege migration revoked projection
-- helpers before the historical helper follow-up was expanded.
grant execute on function public.is_public_restaurant(uuid)
to anon, authenticated, service_role;

grant execute on function public.get_public_restaurant(text)
to anon, authenticated, service_role;

-- Serialize rate-limit decisions for a restaurant/fingerprint pair so parallel
-- checkouts cannot all observe the same remaining slot.
create or replace function public.check_order_submission_rate_limit(
  target_restaurant_id uuid,
  target_client_fingerprint text,
  attempt_limit integer default 8,
  window_size_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $rate_limit$
declare
  recent_attempts integer;
begin
  if attempt_limit < 1
     or window_size_seconds < 1
     or nullif(trim(target_client_fingerprint), '') is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(target_restaurant_id::text || ':' || target_client_fingerprint, 0)
  );

  delete from public.order_submission_attempts
  where created_at < now() - interval '1 day';

  select count(*)
  into recent_attempts
  from public.order_submission_attempts
  where restaurant_id = target_restaurant_id
    and client_fingerprint = target_client_fingerprint
    and created_at >= now() - make_interval(secs => window_size_seconds);

  if recent_attempts >= attempt_limit then
    return false;
  end if;

  insert into public.order_submission_attempts (restaurant_id, client_fingerprint)
  values (target_restaurant_id, target_client_fingerprint);

  return true;
end;
$rate_limit$;

revoke all on function public.check_order_submission_rate_limit(uuid, text, integer, integer)
from public, anon, authenticated;
grant execute on function public.check_order_submission_rate_limit(uuid, text, integer, integer)
to service_role;

-- Idempotent retries must derive customer-consent side effects from the order
-- that owns the submission token, never from a different retry payload.
create or replace function public.create_order_with_customer_v4(
  target_restaurant_id uuid,
  order_customer_name text,
  order_customer_phone text,
  order_fulfilment_type text,
  order_car_plate_number text,
  order_car_description text,
  order_table_number text,
  order_delivery_area text,
  order_delivery_address text,
  order_delivery_latitude numeric,
  order_delivery_longitude numeric,
  order_delivery_google_maps_url text,
  order_delivery_place_id text,
  order_delivery_address_text text,
  order_delivery_landmark text,
  order_notes text,
  order_payment_method text,
  order_items jsonb,
  order_subtotal numeric,
  order_delivery_fee numeric,
  order_total numeric,
  order_whatsapp_message text,
  order_consent_processing boolean,
  order_consent_marketing boolean,
  order_consent_timestamp timestamptz,
  order_submission_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $create_order_v4$
declare
  canonical_phone text := public.normalize_customer_phone(order_customer_phone);
  created_order_id uuid;
begin
  if length(canonical_phone) < 7 or length(canonical_phone) > 15 then
    raise exception 'A valid canonical customer phone is required';
  end if;

  created_order_id := public.create_order_with_customer_v3(
    target_restaurant_id,
    order_customer_name,
    canonical_phone,
    order_fulfilment_type,
    order_car_plate_number,
    order_car_description,
    order_table_number,
    order_delivery_area,
    order_delivery_address,
    order_delivery_latitude,
    order_delivery_longitude,
    order_delivery_google_maps_url,
    order_delivery_place_id,
    order_delivery_address_text,
    order_delivery_landmark,
    order_notes,
    order_payment_method,
    order_items,
    order_subtotal,
    order_delivery_fee,
    order_total,
    order_whatsapp_message,
    order_consent_processing,
    order_consent_marketing,
    order_consent_timestamp,
    order_submission_token
  );

  update public.customers customer
  set
    marketing_opt_in = persisted_order.consent_marketing,
    consent_marketing = persisted_order.consent_marketing,
    consent_timestamp = persisted_order.consent_timestamp,
    marketing_consent_updated_at = persisted_order.consent_timestamp,
    marketing_consent_source = 'checkout',
    marketing_consent_withdrawn_at = case
      when persisted_order.consent_marketing then null
      else persisted_order.consent_timestamp
    end
  from public.orders persisted_order
  where persisted_order.id = created_order_id
    and persisted_order.restaurant_id = target_restaurant_id
    and customer.restaurant_id = persisted_order.restaurant_id
    and customer.phone = persisted_order.customer_phone;

  insert into public.order_status_events (
    restaurant_id,
    order_id,
    from_status,
    to_status,
    actor_role,
    reason
  )
  select
    target_restaurant_id,
    created_order_id,
    null,
    'New',
    'customer',
    'order_created'
  where not exists (
    select 1
    from public.order_status_events
    where restaurant_id = target_restaurant_id
      and order_id = created_order_id
      and reason = 'order_created'
  );

  return created_order_id;
end;
$create_order_v4$;

revoke all on function public.create_order_with_customer_v4(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, text,
  text, text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.create_order_with_customer_v4(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, text,
  text, text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz, text
) to service_role;

notify pgrst, 'reload schema';
