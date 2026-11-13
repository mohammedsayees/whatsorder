-- WhatsOrder: order attribution source (Marketing Phase 3 — measurement).
--
-- orders.attribution_source — nullable token from the store link's `?src=`
-- (e.g. poster-<uuid> for a Poster Studio caption link). Written once, by the
-- service-role checkout action right after create_order_with_customer_v5
-- returns, scoped by restaurant_id + order id. The order RPC's signature and
-- its pricing/consent logic are unchanged, and no RLS policy changes: orders
-- keep their existing member-read / service-role-write posture.
--
-- Poster history counts attributed orders with
--   restaurant_id = <session tenant> and attribution_source = 'poster-<id>',
-- served by the partial index below.

alter table public.orders
  add column if not exists attribution_source text;

alter table public.orders
  drop constraint if exists orders_attribution_source_format;
alter table public.orders
  add constraint orders_attribution_source_format
  check (
    attribution_source is null
    or attribution_source ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  );

create index if not exists orders_restaurant_attribution_idx
  on public.orders (restaurant_id, attribution_source)
  where attribution_source is not null;

-- ── self-verification ───────────────────────────────────────────────────────

do $verify_order_attribution$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'orders'
      and column_name = 'attribution_source'
      and is_nullable = 'YES'
  ) then
    raise exception 'orders.attribution_source must exist and be nullable';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'orders' and c.relrowsecurity
  ) then
    raise exception 'orders must keep row level security enabled';
  end if;

  -- Same invariant as the P0-3 least-privilege migration: orders have no
  -- write policies at all; creation stays locked to the service-role RPC.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'orders'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'orders must not have write policies (service-role writes only)';
  end if;
end;
$verify_order_attribution$;

notify pgrst, 'reload schema';
