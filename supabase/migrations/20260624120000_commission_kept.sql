-- WhatsOrder: "Commission kept" dashboard figure
--
-- A retention/value figure for the restaurant owner: how much aggregator
-- (Talabat) commission they have AVOIDED by taking DELIVERY orders through
-- WhatsOrder instead. It is a pure read of existing order data plus a
-- configurable commission rate. No customer-facing change, no external API.
--
-- Two pieces:
--   1. restaurants.commission_rate — the owner's aggregator commission rate as
--      a percentage (e.g. 27.00). Nullable: when NULL the app falls back to a
--      visibly-labelled 27% default, so every restaurant works unchanged.
--   2. get_restaurant_commission_kept(uuid) — returns the month-to-date and
--      all-time COUNT and commission BASE (food subtotal) of COMPLETED DELIVERY
--      orders. The rate is applied in the app layer (so the labelled-default
--      logic lives in one tested place).
--
-- Conservative by design — the figure must never overstate savings:
--   * Only fulfilment_type = 'delivery' counts. Talabat charged commission on
--     delivery only, so dine-in / takeaway / "Bring to my car" are excluded.
--   * Only status = 'Completed' orders count. Cancelled / in-progress excluded.
--   * The base is the food SUBTOTAL, not the order total — the delivery fee is
--     excluded because it is not aggregator food commission.

alter table public.restaurants
  add column if not exists commission_rate numeric(5, 2);

alter table public.restaurants
  drop constraint if exists restaurants_commission_rate_range;
alter table public.restaurants
  add constraint restaurants_commission_rate_range
  check (commission_rate is null or (commission_rate > 0 and commission_rate <= 100));

comment on column public.restaurants.commission_rate is
  'Aggregator (e.g. Talabat) commission percentage this restaurant used to pay on delivery orders, e.g. 27.00. NULL = use the app''s labelled 27% default. Drives the "commission kept" dashboard figure only.';

-- Month-to-date and all-time totals of COMPLETED DELIVERY orders for one
-- restaurant. Returns counts and the commission BASE (food subtotal); the app
-- multiplies by the effective commission rate.
create or replace function public.get_restaurant_commission_kept(
  target_restaurant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $commission_kept$
  with boundaries as (
    select
      date_trunc('month', now() at time zone 'Asia/Dubai') at time zone 'Asia/Dubai'
        as month_start
  ),
  delivery_orders as (
    select
      orders.created_at,
      coalesce(orders.subtotal, 0) as base
    from public.orders
    where orders.restaurant_id = target_restaurant_id
      and orders.fulfilment_type = 'delivery'
      and orders.status = 'Completed'
  ),
  metrics as (
    select
      count(*) filter (
        where delivery_orders.created_at >= boundaries.month_start
      )::integer as month_orders,
      coalesce(sum(delivery_orders.base) filter (
        where delivery_orders.created_at >= boundaries.month_start
      ), 0) as month_base,
      count(*)::integer as all_time_orders,
      coalesce(sum(delivery_orders.base), 0) as all_time_base
    from delivery_orders
    cross join boundaries
  )
  select jsonb_build_object(
    'monthOrders', metrics.month_orders,
    'monthBase', metrics.month_base,
    'allTimeOrders', metrics.all_time_orders,
    'allTimeBase', metrics.all_time_base
  )
  from metrics;
$commission_kept$;

revoke all on function public.get_restaurant_commission_kept(uuid)
from public, anon, authenticated;
grant execute on function public.get_restaurant_commission_kept(uuid)
to service_role;

notify pgrst, 'reload schema';
