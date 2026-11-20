-- Customer vouchers (account page phase 3).
--
-- Owners can opt a promo code in to being shown to signed-in customers
-- (promo_codes.show_in_account, default false: existing codes stay private).
-- get_customer_vouchers lists, for ONE customer at ONE restaurant, the opted-in
-- codes that customer can still use right now: active, inside the date
-- window, under the total and per-customer limits (cancelled orders do not
-- count, as in get_promo_code_usage), and first-order-only codes only for a
-- customer without orders. The owner's private note (description) is never
-- returned.
--
-- Read-only, service-role only: the server passes the phone from the signed
-- customer session. Redemption is unchanged: create_order_with_customer_v6
-- still re-checks every rule under a lock when the order is placed.

begin;

alter table public.promo_codes
  add column if not exists show_in_account boolean not null default false;

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
  candidates as (
    select promo.*
    from public.promo_codes promo
    where promo.restaurant_id = p_restaurant_id
      and promo.show_in_account
      and promo.is_active
      and (promo.starts_at is null or promo.starts_at <= now())
      and (promo.ends_at is null or promo.ends_at > now())
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
        'uses_left', case
          when c.max_redemptions_per_customer is null then null
          else c.max_redemptions_per_customer - coalesce(u.customer_used, 0)
        end
      )
      order by c.ends_at asc nulls last, c.created_at desc
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

commit;
