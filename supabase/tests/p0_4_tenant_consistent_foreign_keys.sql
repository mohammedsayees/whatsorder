\set ON_ERROR_STOP on

-- Run against an isolated database after applying the P0-4 migration.
-- All changes are rollback-only.

begin;

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active)
values
  ('21000000-0000-0000-0000-000000000001', 'P0-4 Tenant A', 'p0-4-a', '971500000001', 'live', true),
  ('21000000-0000-0000-0000-000000000002', 'P0-4 Tenant B', 'p0-4-b', '971500000002', 'live', true);

insert into public.menu_categories (id, restaurant_id, name)
values
  ('61000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'Tenant A category'),
  ('61000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', 'Tenant B category');

do $cross_tenant_menu_item$
begin
  begin
    insert into public.menu_items (
      id, restaurant_id, category_id, name, price
    )
    values (
      '71000000-0000-0000-0000-000000000001',
      '21000000-0000-0000-0000-000000000001',
      '61000000-0000-0000-0000-000000000002',
      'Invalid cross-tenant item',
      10
    );
    raise exception 'Cross-tenant menu item unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;
end;
$cross_tenant_menu_item$;

insert into public.orders (
  id,
  restaurant_id,
  customer_name,
  customer_phone,
  payment_method,
  items,
  subtotal,
  delivery_fee,
  total,
  whatsapp_message,
  consent_order_processing,
  consent_timestamp
)
values
  (
    '41000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000001',
    'Tenant A customer',
    '971500000011',
    'Cash on Delivery',
    '[]'::jsonb,
    10,
    0,
    10,
    'test',
    true,
    now()
  ),
  (
    '41000000-0000-0000-0000-000000000002',
    '21000000-0000-0000-0000-000000000002',
    'Tenant B customer',
    '971500000012',
    'Cash on Delivery',
    '[]'::jsonb,
    10,
    0,
    10,
    'test',
    true,
    now()
  );

do $cross_tenant_feedback$
begin
  begin
    insert into public.feedback_requests (
      restaurant_id, order_id, token_hash, expires_at
    )
    values (
      '21000000-0000-0000-0000-000000000001',
      '41000000-0000-0000-0000-000000000002',
      'p0-4-cross-tenant-token',
      now() + interval '1 day'
    );
    raise exception 'Cross-tenant feedback request unexpectedly succeeded';
  exception
    when foreign_key_violation then null;
  end;
end;
$cross_tenant_feedback$;

do $catalog_checks$
declare
  constraint_name text;
begin
  foreach constraint_name in array array[
    'menu_items_category_tenant_fkey',
    'menu_offers_item_tenant_fkey',
    'feedback_requests_order_tenant_fkey',
    'customer_feedback_order_tenant_fkey',
    'loyalty_transactions_customer_tenant_fkey',
    'loyalty_transactions_order_tenant_fkey',
    'order_submission_keys_order_tenant_fkey',
    'order_status_events_order_tenant_fkey',
    'order_print_events_order_tenant_fkey'
  ]
  loop
    if not exists (
      select 1
      from pg_constraint
      where conname = constraint_name
        and convalidated = true
    ) then
      raise exception 'Tenant constraint % is missing or unvalidated', constraint_name;
    end if;
  end loop;
end;
$catalog_checks$;

rollback;
