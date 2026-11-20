-- Customer account page (phase 1): one read-only RPC for /r/[slug]/account.
--
-- Returns, for ONE customer at ONE restaurant (identity = restaurant_id +
-- phone, the same key as get_customer_context and the session cookie):
--   { profile, loyalty, loyalty_history, orders, has_more }
-- `orders` is a page (newest first) with the money and payment fields the
-- account page shows as "Payments"; p_before is the created_at of the last
-- order already shown (keyset pagination).
--
-- No schema change. Read-only. Callable by service_role only: the server
-- resolves the phone from the signed customer session cookie, so the browser
-- can never pass a phone or restaurant of its choosing.

create or replace function public.get_customer_account(
  p_restaurant_id uuid,
  p_phone text,
  p_before timestamptz default null,
  p_limit int default 20
)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with cfg as (
    select least(greatest(coalesce(p_limit, 20), 1), 50) as page_size
  ),
  customer as (
    select c.*
    from public.customers c
    where c.restaurant_id = p_restaurant_id
      and c.phone = p_phone
  ),
  page as (
    select o.id, o.created_at, o.status, o.total, o.subtotal, o.delivery_fee,
           o.discount_amount, o.loyalty_discount, o.promo_code, o.items,
           o.fulfilment_type, o.payment_method, o.online_payment_status,
           o.online_paid_at, o.points_earned, o.points_redeemed
    from public.orders o
    where o.restaurant_id = p_restaurant_id
      and o.customer_phone = p_phone
      and (p_before is null or o.created_at < p_before)
    order by o.created_at desc
    limit (select page_size + 1 from cfg)
  ),
  numbered as (
    select page.*, row_number() over (order by page.created_at desc) as rn
    from page
  )
  select jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'phone', c.phone,
        'default_address_text', c.default_address_text,
        'default_landmark', c.default_landmark,
        'delivery_area', c.delivery_area,
        'delivery_address', c.delivery_address,
        'total_orders', c.total_orders,
        'total_spend', c.total_spend,
        'last_order_at', c.last_order_at,
        'member_since', c.created_at,
        'consent_marketing', c.consent_marketing
      )
      from customer c
    ),
    'loyalty', (
      select jsonb_build_object(
        'enabled', r.loyalty_enabled,
        'stamps', coalesce((select c.loyalty_points_balance from customer c), 0),
        'stamps_required', r.loyalty_stamps_required,
        'reward', r.loyalty_reward_description,
        'lifetime', coalesce((select c.lifetime_points_earned from customer c), 0)
      )
      from public.restaurants r
      where r.id = p_restaurant_id
    ),
    'loyalty_history', (
      select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
      from (
        select lt.id, lt.created_at, lt.type, lt.points, lt.description, lt.order_id
        from public.loyalty_transactions lt
        join customer c on c.id = lt.customer_id
        where lt.restaurant_id = p_restaurant_id
        order by lt.created_at desc
        limit 20
      ) t
    ),
    'orders', (
      select coalesce(
        jsonb_agg(to_jsonb(n) - 'rn' order by n.created_at desc),
        '[]'::jsonb
      )
      from numbered n
      where n.rn <= (select page_size from cfg)
    ),
    'has_more', (select count(*) > (select page_size from cfg) from page)
  );
$function$;

revoke all on function public.get_customer_account(uuid, text, timestamptz, int)
  from public, anon, authenticated;
grant execute on function public.get_customer_account(uuid, text, timestamptz, int)
  to service_role;
