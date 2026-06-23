-- WhatsOrder: drop duplicate / redundant indexes
--
-- Performance-advisor cleanup. Both indexes below are byte-for-byte duplicates
-- of an existing UNIQUE-constraint-backed index on the same columns, so they
-- add write overhead (every insert/update maintains a second identical btree)
-- for zero read benefit. Dropping a duplicate cannot change any query plan: the
-- identical constraint index remains available to the planner.
--
-- 1. menu_offers: idx_menu_offers_restaurant_item_unique duplicates the
--    constraint index menu_offers_restaurant_id_menu_item_id_key
--    (both: UNIQUE (restaurant_id, menu_item_id)).
-- 2. customers: idx_customers_restaurant_phone duplicates the constraint index
--    customers_restaurant_id_phone_key (both: (restaurant_id, phone)).
--
-- Plain DROP INDEX (not CONCURRENTLY): both tables are tiny and the brief lock
-- is negligible, and CONCURRENTLY cannot run inside the migration transaction.
-- Reversible — recreate the index if ever needed.

DROP INDEX IF EXISTS public.idx_menu_offers_restaurant_item_unique;
DROP INDEX IF EXISTS public.idx_customers_restaurant_phone;
