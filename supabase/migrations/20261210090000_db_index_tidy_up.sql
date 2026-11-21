-- Index tidy-up from the Supabase advisors (Nov 2026), kept deliberately small.
--
-- What was NOT changed, and why:
-- - "Unused" indexes (82 with idx_scan = 0 over 9 days of stats): each is
--   8-16 kB; most are UNIQUE indexes that enforce tenant-consistent foreign
--   keys, idempotency keys or one-per-order rules, and the rest likely serve
--   rare jobs (billing, cleanup, deletion) that 9 quiet days would not show.
--   Dropping them saves nothing measurable and risks a slow rare path.
-- - Most of the 140 "unindexed foreign keys": 49 point at auth.users (only
--   checked when a user account is deleted), and many composite tenant FKs
--   are already served by an index that starts with the same columns in a
--   different order (e.g. orders(customer_id, restaurant_id) by
--   (restaurant_id, customer_id, created_at)).
-- - "Multiple permissive policies": the app reads with the service role,
--   which bypasses RLS, so merging policies changes security rules for no
--   real speed-up.
--
-- What changes:
-- 1. Drop three exact duplicates (another index covers the same columns).
-- 2. Index three foreign keys that have no usable index, on tables that grow
--    with orders, whose parent rows are deleted in normal operation, so each
--    parent delete currently scans the whole child table.

-- 1 ------------------------------------------------------------------------
-- Same column as the unique feedback_requests_token_hash_key.
drop index if exists public.idx_feedback_requests_token;
-- Partial copy of the unique whatsapp_integrations_connector_session_id_key.
drop index if exists public.idx_whatsapp_integrations_connector_session;
-- Same columns as the unique business_days_restaurant_date_unique (a btree
-- reads either direction, so the DESC copy adds nothing).
drop index if exists public.idx_business_days_restaurant_date;

-- 2 ------------------------------------------------------------------------
-- Deleting a menu item (admin menu editor) checks this table, which gains a
-- row per order line.
create index if not exists idx_finance_product_cost_snapshots_menu_item
  on public.finance_product_cost_snapshots (menu_item_id, restaurant_id);

-- Deleting a restaurant (daily demo cleanup, permanent deletion) cascades
-- here; the table gains rows with every order notification.
create index if not exists idx_order_notification_jobs_restaurant
  on public.order_notification_jobs (restaurant_id);

-- Deleting a shift (as part of deleting a restaurant) checks orders for
-- origin_shift_id. Without this, every shift deleted scans every order of
-- every tenant. Partial: most orders have no origin shift.
create index if not exists idx_orders_origin_shift
  on public.orders (origin_shift_id, restaurant_id)
  where origin_shift_id is not null;

do $verify_index_tidy_up$
begin
  -- The unique indexes that make the dropped ones redundant must remain.
  if to_regclass('public.feedback_requests_token_hash_key') is null
     or to_regclass('public.whatsapp_integrations_connector_session_id_key') is null
     or to_regclass('public.business_days_restaurant_date_unique') is null then
    raise exception 'A covering unique index is missing; refusing to leave lookups unindexed';
  end if;
  if to_regclass('public.idx_finance_product_cost_snapshots_menu_item') is null
     or to_regclass('public.idx_order_notification_jobs_restaurant') is null
     or to_regclass('public.idx_orders_origin_shift') is null then
    raise exception 'Foreign-key indexes were not created';
  end if;
end;
$verify_index_tidy_up$;
