-- Offline staff order punch: idempotent sync support.
--
-- Staff devices queue punched orders locally during internet outages and
-- replay them when connectivity returns. Each punched order carries a
-- client-generated UUID; the per-restaurant unique index makes replays
-- idempotent (a retry after a timeout cannot create a duplicate order).
-- punched_at preserves the moment staff actually punched the order, which can
-- be hours before the row is inserted (created_at) after a long outage.

alter table public.orders
  add column if not exists client_order_id uuid,
  add column if not exists punched_at timestamptz;

create unique index if not exists orders_restaurant_client_order_key
  on public.orders (restaurant_id, client_order_id)
  where client_order_id is not null;
