-- WhatsOrder P0-1: lock down public order creation
-- Run once after pilot_launch_hardening_migration.sql.
--
-- Customer checkout remains available through the Next.js server action, which
-- calls public.create_order_with_customer_v3 with the service-role client.
-- Anonymous and authenticated Supabase clients must not insert orders directly,
-- because doing so would bypass menu pricing, opening-hours, fulfilment,
-- duplicate-submission, customer-upsert, and rate-limit validation.

drop policy if exists "Public can insert new orders" on public.orders;

revoke insert on table public.orders from public;
revoke insert on table public.orders from anon;
revoke insert on table public.orders from authenticated;

-- Reassert the intended order-creation boundary even if earlier function grants
-- drifted in an existing Supabase project.
revoke all on function public.create_order_with_customer_v3(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, text,
  text, text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.create_order_with_customer_v3(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, text,
  text, text, text, text, text, jsonb, numeric, numeric, numeric, text, boolean,
  boolean, timestamptz, text
) to service_role;

notify pgrst, 'reload schema';

-- Rollback consideration:
-- Do not restore the legacy anonymous INSERT policy. If checkout fails after
-- applying this migration, roll back the application deployment or repair the
-- service-role/RPC configuration while keeping direct public inserts disabled.
