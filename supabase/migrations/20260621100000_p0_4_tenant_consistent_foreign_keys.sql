-- WhatsOrder P0-4: tenant-consistent foreign keys
--
-- Existing single-column foreign keys are retained so their current cascade or
-- set-null behavior remains unchanged. Composite constraints add the missing
-- guarantee that a child row and its referenced parent belong to the same
-- restaurant.
--
-- This migration fails before adding constraints if existing cross-tenant
-- relationships are found. Inspect and repair those rows before retrying.

do $tenant_conflict_check$
declare
  conflict_count bigint;
begin
  select count(*)
  into conflict_count
  from public.menu_items child
  join public.menu_categories parent on parent.id = child.category_id
  where child.restaurant_id <> parent.restaurant_id;
  if conflict_count > 0 then
    raise exception
      'P0-4 blocked: % menu_items reference a category from another restaurant',
      conflict_count;
  end if;

  select count(*)
  into conflict_count
  from public.menu_offers child
  join public.menu_items parent on parent.id = child.menu_item_id
  where child.restaurant_id <> parent.restaurant_id;
  if conflict_count > 0 then
    raise exception
      'P0-4 blocked: % menu_offers reference an item from another restaurant',
      conflict_count;
  end if;

  select count(*)
  into conflict_count
  from public.feedback_requests child
  join public.orders parent on parent.id = child.order_id
  where child.restaurant_id <> parent.restaurant_id;
  if conflict_count > 0 then
    raise exception
      'P0-4 blocked: % feedback_requests reference an order from another restaurant',
      conflict_count;
  end if;

  select count(*)
  into conflict_count
  from public.customer_feedback child
  join public.orders parent on parent.id = child.order_id
  where child.restaurant_id <> parent.restaurant_id;
  if conflict_count > 0 then
    raise exception
      'P0-4 blocked: % customer_feedback rows reference an order from another restaurant',
      conflict_count;
  end if;

  select count(*)
  into conflict_count
  from public.loyalty_transactions child
  join public.customers parent on parent.id = child.customer_id
  where child.restaurant_id <> parent.restaurant_id;
  if conflict_count > 0 then
    raise exception
      'P0-4 blocked: % loyalty transactions reference a customer from another restaurant',
      conflict_count;
  end if;

  select count(*)
  into conflict_count
  from public.loyalty_transactions child
  join public.orders parent on parent.id = child.order_id
  where child.order_id is not null
    and child.restaurant_id <> parent.restaurant_id;
  if conflict_count > 0 then
    raise exception
      'P0-4 blocked: % loyalty transactions reference an order from another restaurant',
      conflict_count;
  end if;

  select count(*)
  into conflict_count
  from public.order_submission_keys child
  join public.orders parent on parent.id = child.order_id
  where child.order_id is not null
    and child.restaurant_id <> parent.restaurant_id;
  if conflict_count > 0 then
    raise exception
      'P0-4 blocked: % order submission keys reference an order from another restaurant',
      conflict_count;
  end if;

  select count(*)
  into conflict_count
  from public.order_status_events child
  join public.orders parent on parent.id = child.order_id
  where child.restaurant_id <> parent.restaurant_id;
  if conflict_count > 0 then
    raise exception
      'P0-4 blocked: % order status events reference an order from another restaurant',
      conflict_count;
  end if;

  select count(*)
  into conflict_count
  from public.order_print_events child
  join public.orders parent on parent.id = child.order_id
  where child.restaurant_id <> parent.restaurant_id;
  if conflict_count > 0 then
    raise exception
      'P0-4 blocked: % order print events reference an order from another restaurant',
      conflict_count;
  end if;
end;
$tenant_conflict_check$;

do $parent_unique_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'menu_categories_id_restaurant_unique'
      and conrelid = 'public.menu_categories'::regclass
  ) then
    alter table public.menu_categories
      add constraint menu_categories_id_restaurant_unique
      unique (id, restaurant_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'menu_items_id_restaurant_unique'
      and conrelid = 'public.menu_items'::regclass
  ) then
    alter table public.menu_items
      add constraint menu_items_id_restaurant_unique
      unique (id, restaurant_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_id_restaurant_unique'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_id_restaurant_unique
      unique (id, restaurant_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'customers_id_restaurant_unique'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_id_restaurant_unique
      unique (id, restaurant_id);
  end if;
end;
$parent_unique_constraints$;

do $tenant_foreign_keys$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'menu_items_category_tenant_fkey'
      and conrelid = 'public.menu_items'::regclass
  ) then
    alter table public.menu_items
      add constraint menu_items_category_tenant_fkey
      foreign key (category_id, restaurant_id)
      references public.menu_categories(id, restaurant_id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'menu_offers_item_tenant_fkey'
      and conrelid = 'public.menu_offers'::regclass
  ) then
    alter table public.menu_offers
      add constraint menu_offers_item_tenant_fkey
      foreign key (menu_item_id, restaurant_id)
      references public.menu_items(id, restaurant_id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'feedback_requests_order_tenant_fkey'
      and conrelid = 'public.feedback_requests'::regclass
  ) then
    alter table public.feedback_requests
      add constraint feedback_requests_order_tenant_fkey
      foreign key (order_id, restaurant_id)
      references public.orders(id, restaurant_id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'customer_feedback_order_tenant_fkey'
      and conrelid = 'public.customer_feedback'::regclass
  ) then
    alter table public.customer_feedback
      add constraint customer_feedback_order_tenant_fkey
      foreign key (order_id, restaurant_id)
      references public.orders(id, restaurant_id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'loyalty_transactions_customer_tenant_fkey'
      and conrelid = 'public.loyalty_transactions'::regclass
  ) then
    alter table public.loyalty_transactions
      add constraint loyalty_transactions_customer_tenant_fkey
      foreign key (customer_id, restaurant_id)
      references public.customers(id, restaurant_id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'loyalty_transactions_order_tenant_fkey'
      and conrelid = 'public.loyalty_transactions'::regclass
  ) then
    alter table public.loyalty_transactions
      add constraint loyalty_transactions_order_tenant_fkey
      foreign key (order_id, restaurant_id)
      references public.orders(id, restaurant_id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'order_submission_keys_order_tenant_fkey'
      and conrelid = 'public.order_submission_keys'::regclass
  ) then
    alter table public.order_submission_keys
      add constraint order_submission_keys_order_tenant_fkey
      foreign key (order_id, restaurant_id)
      references public.orders(id, restaurant_id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'order_status_events_order_tenant_fkey'
      and conrelid = 'public.order_status_events'::regclass
  ) then
    alter table public.order_status_events
      add constraint order_status_events_order_tenant_fkey
      foreign key (order_id, restaurant_id)
      references public.orders(id, restaurant_id)
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'order_print_events_order_tenant_fkey'
      and conrelid = 'public.order_print_events'::regclass
  ) then
    alter table public.order_print_events
      add constraint order_print_events_order_tenant_fkey
      foreign key (order_id, restaurant_id)
      references public.orders(id, restaurant_id)
      not valid;
  end if;
end;
$tenant_foreign_keys$;

alter table public.menu_items
  validate constraint menu_items_category_tenant_fkey;
alter table public.menu_offers
  validate constraint menu_offers_item_tenant_fkey;
alter table public.feedback_requests
  validate constraint feedback_requests_order_tenant_fkey;
alter table public.customer_feedback
  validate constraint customer_feedback_order_tenant_fkey;
alter table public.loyalty_transactions
  validate constraint loyalty_transactions_customer_tenant_fkey;
alter table public.loyalty_transactions
  validate constraint loyalty_transactions_order_tenant_fkey;
alter table public.order_submission_keys
  validate constraint order_submission_keys_order_tenant_fkey;
alter table public.order_status_events
  validate constraint order_status_events_order_tenant_fkey;
alter table public.order_print_events
  validate constraint order_print_events_order_tenant_fkey;

notify pgrst, 'reload schema';
