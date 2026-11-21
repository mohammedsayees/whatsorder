-- Platform-wide "orders since <date>" counts (super-admin dashboard,
-- src/lib/super-admin-data.ts) filter on created_at alone. The only
-- created_at index leads with restaurant_id, so Postgres walked all of it:
-- ~300 ms on ~9.3k orders, growing with every order on the platform.
-- A plain created_at index makes these range counts index-only.

create index if not exists idx_orders_created_at
  on public.orders (created_at);

do $verify_orders_created_at_index$
begin
  if to_regclass('public.idx_orders_created_at') is null then
    raise exception 'idx_orders_created_at was not created';
  end if;
end;
$verify_orders_created_at_index$;
