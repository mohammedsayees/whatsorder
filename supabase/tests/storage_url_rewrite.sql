-- Checks scripts/rewrite-storage-urls.sql (operator tool for the region move).
-- Rollback-only: the script runs nested (as a savepoint) inside this test's
-- transaction, so no fixture is ever committed.
\set ON_ERROR_STOP on
\set old_ref 'aaaaaaaaaaaaaaaaaaaa'
\set new_ref 'bbbbbbbbbbbbbbbbbbbb'
\set nested true
begin;

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active, logo_url, cover_image_url, daily_summary_phones) values
  ('2f700000-0000-0000-0000-000000000001', 'URL rewrite', 'url-rewrite-test', '971500000201', 'live', true,
   'https://aaaaaaaaaaaaaaaaaaaa.supabase.co/storage/v1/object/public/restaurant-assets/r/logo.webp',
   'https://cdn.example.com/cover.webp',
   array['971500000201', 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co/storage/v1/object/public/restaurant-assets/r/x.webp']);
insert into public.menu_categories (id, restaurant_id, name) values
  ('3f700000-0000-0000-0000-000000000001', '2f700000-0000-0000-0000-000000000001', 'Rewrite');
insert into public.menu_items (id, restaurant_id, category_id, name, price, image_url, description) values
  ('4f700000-0000-0000-0000-000000000001', '2f700000-0000-0000-0000-000000000001', '3f700000-0000-0000-0000-000000000001',
   'Tea', 5, 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co/storage/v1/object/public/menu-images/r/tea.webp',
   'See https://aaaaaaaaaaaaaaaaaaaa.supabase.co/rest/v1/ (not a storage link)');
insert into public.orders (
  id, restaurant_id, customer_name, customer_phone, fulfilment_type, payment_method,
  items, subtotal, delivery_fee, total, status, whatsapp_message,
  consent_order_processing, consent_timestamp
) values (
  '5f700000-0000-0000-0000-000000000001', '2f700000-0000-0000-0000-000000000001',
  'Rewrite test', '971500000202', 'takeaway', 'Cash on Delivery',
  '[{"item_id":"4f700000-0000-0000-0000-000000000001","name":"Tea","price":5,"quantity":1,"image_url":"https://aaaaaaaaaaaaaaaaaaaa.supabase.co/storage/v1/object/public/menu-images/r/tea.webp"}]',
  5, 0, 5, 'Completed', 'test', true, now()
);
-- Back-date updated_at (with triggers off, or set_updated_at would overwrite
-- it) so any trigger fired by the rewrite would show as a changed timestamp.
set local session_replication_role = replica;
update public.menu_items set updated_at = '2026-01-01T00:00:00Z' where id = '4f700000-0000-0000-0000-000000000001';
update public.orders set updated_at = '2026-01-01T00:00:00Z' where id = '5f700000-0000-0000-0000-000000000001';
set local session_replication_role = origin;
do $backdate_checks$
begin
  if (select updated_at from public.menu_items where id = '4f700000-0000-0000-0000-000000000001') <> '2026-01-01T00:00:00Z' then
    raise exception 'fixture back-date did not stick';
  end if;
end;
$backdate_checks$;

-- Dry run: reports, changes nothing.
\ir ../../scripts/rewrite-storage-urls.sql
do $dry_run_checks$
begin
  if (select image_url from public.menu_items where id = '4f700000-0000-0000-0000-000000000001')
     not like 'https://aaaaaaaaaaaaaaaaaaaa.%' then
    raise exception 'Dry run changed data';
  end if;
end;
$dry_run_checks$;

-- Apply.
\set apply true
\ir ../../scripts/rewrite-storage-urls.sql
do $apply_checks$
declare item record; restaurant record; order_row record;
begin
  select * into item from public.menu_items where id = '4f700000-0000-0000-0000-000000000001';
  select * into restaurant from public.restaurants where id = '2f700000-0000-0000-0000-000000000001';
  select * into order_row from public.orders where id = '5f700000-0000-0000-0000-000000000001';
  if item.image_url <> 'https://bbbbbbbbbbbbbbbbbbbb.supabase.co/storage/v1/object/public/menu-images/r/tea.webp' then
    raise exception 'text column not rewritten: %', item.image_url;
  end if;
  if restaurant.logo_url not like 'https://bbbbbbbbbbbbbbbbbbbb.supabase.co/storage/v1/%' then
    raise exception 'logo_url not rewritten: %', restaurant.logo_url;
  end if;
  if order_row.items->0->>'image_url' not like 'https://bbbbbbbbbbbbbbbbbbbb.supabase.co/storage/v1/%' then
    raise exception 'jsonb column not rewritten: %', order_row.items;
  end if;
  if restaurant.daily_summary_phones <> array['971500000201', 'https://bbbbbbbbbbbbbbbbbbbb.supabase.co/storage/v1/object/public/restaurant-assets/r/x.webp'] then
    raise exception 'text[] column not rewritten in order: %', restaurant.daily_summary_phones;
  end if;
  if restaurant.cover_image_url <> 'https://cdn.example.com/cover.webp' then
    raise exception 'unrelated URL changed';
  end if;
  if item.description <> 'See https://aaaaaaaaaaaaaaaaaaaa.supabase.co/rest/v1/ (not a storage link)' then
    raise exception 'non-storage mention of the old project changed';
  end if;
  if item.updated_at <> '2026-01-01T00:00:00Z' or order_row.updated_at <> '2026-01-01T00:00:00Z' then
    raise exception 'triggers fired during the rewrite';
  end if;
end;
$apply_checks$;

-- Re-running finds nothing left to rewrite.
\ir ../../scripts/rewrite-storage-urls.sql

rollback;
