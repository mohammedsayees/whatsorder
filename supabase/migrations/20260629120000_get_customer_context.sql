-- Back-fill migration: records get_customer_context(), which was deployed
-- directly to production ahead of the customer-login feature but had no SQL
-- file in this repo (migration-first guardrail). Definition below mirrors the
-- live function exactly; CREATE OR REPLACE makes re-applying a no-op.
--
-- Returns, in one round-trip, the prefill payload the customer PWA needs:
--   { profile, loyalty, recent_orders }
-- SECURITY DEFINER + service_role-only execute: it bypasses RLS, so it must
-- only ever be called from server-side service-role code (the
-- /api/customer/context route), never from an anon/authenticated browser JWT.

CREATE OR REPLACE FUNCTION public.get_customer_context(p_restaurant_id uuid, p_phone text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'profile', (
      SELECT to_jsonb(c)
      FROM (
        SELECT id, name, phone,
               default_address_text, default_landmark,
               default_latitude, default_longitude, default_google_maps_url,
               delivery_area, delivery_address,
               last_order_at, total_orders, total_spend,
               consent_marketing
        FROM customers
        WHERE restaurant_id = p_restaurant_id AND phone = p_phone
      ) c
    ),
    'loyalty', (
      SELECT jsonb_build_object(
        'enabled', r.loyalty_enabled,
        'stamps', COALESCE(cu.loyalty_points_balance, 0),
        'stamps_required', r.loyalty_stamps_required,
        'reward', r.loyalty_reward_description,
        'lifetime', COALESCE(cu.lifetime_points_earned, 0)
      )
      FROM restaurants r
      LEFT JOIN customers cu
        ON cu.restaurant_id = r.id AND cu.phone = p_phone
      WHERE r.id = p_restaurant_id
    ),
    'recent_orders', (
      SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, created_at, status, total, items, fulfilment_type
        FROM orders
        WHERE restaurant_id = p_restaurant_id AND customer_phone = p_phone
        ORDER BY created_at DESC
        LIMIT 5
      ) t
    )
  );
$function$;

-- Lock execution to service-role only (matches live grants: postgres + service_role).
REVOKE ALL ON FUNCTION public.get_customer_context(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_customer_context(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_context(uuid, text) TO service_role;
