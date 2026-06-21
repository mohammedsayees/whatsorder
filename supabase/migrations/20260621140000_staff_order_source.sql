-- WhatsOrder Phase 1: staff-entered (counter) orders
--
-- Adds a source marker to orders so counter/phone orders punched in by staff
-- can be told apart from customer self-service orders in reporting. Staff orders
-- are created by an authenticated server action using the service-role client
-- (the same trust boundary as menu/settings writes), so no new RLS grants are
-- needed and direct public inserts remain locked.

alter table public.orders
  add column if not exists source text not null default 'customer';

do $orders_source_check$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_source_check'
  ) then
    alter table public.orders
      add constraint orders_source_check check (source in ('customer', 'staff'));
  end if;
end;
$orders_source_check$;

-- Supports "counter vs online" reporting per restaurant without scanning.
create index if not exists idx_orders_restaurant_source_created
  on public.orders(restaurant_id, source, created_at desc);

notify pgrst, 'reload schema';

-- Rollback consideration:
-- Dropping the column would lose the counter/online distinction on historical
-- orders. The column defaults to 'customer', so existing rows are unaffected.
