-- Permanent restaurant deletion (Super Admin only).
--
-- Until now a restaurant could only be paused or cancelled; its menu,
-- orders, customers (names, phones, addresses), staff and files stayed
-- forever. This adds a guarded, audited hard delete:
--
-- * restaurant_deletions keeps a minimal audit record per deletion: who,
--   when, the store name/link, row counts, and a copy of WhatsOrder's own
--   billing records for the café (subscriptions, invoices, payments). Tax
--   records must be kept; customer personal data is NOT copied.
-- * export_restaurant_data(id) returns every restaurant-owned row as JSON so
--   the operator can hand the café its data before erasing it.
-- * delete_restaurant_permanently(id, confirm_slug, actor) only works on a
--   restaurant whose status is already 'cancelled' and only when the typed
--   store link matches. It deletes every row in every public table with a
--   restaurant_id column, then the restaurant. Tables are discovered from
--   the catalogue, so tables added later are covered automatically, and
--   the delete order is resolved by retrying tables blocked by RESTRICT /
--   NO ACTION foreign keys until everything is gone (or it fails and the
--   whole transaction rolls back, leaving nothing half-deleted).
--
-- Both functions are security definer and executable by service_role only.
-- Storage files and Auth users are cleaned up by the server action, which
-- reads them before calling the delete.

create table if not exists public.restaurant_deletions (
  id uuid primary key default gen_random_uuid(),
  -- Deliberately not named restaurant_id and not a foreign key: the
  -- restaurant no longer exists, and the generic delete/export below must
  -- not treat this audit table as restaurant-owned data.
  deleted_restaurant_id uuid not null,
  restaurant_name text not null,
  restaurant_slug text not null,
  deleted_by uuid,
  deleted_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb,
  billing_snapshot jsonb not null default '{}'::jsonb
);

create index if not exists restaurant_deletions_deleted_at_idx
  on public.restaurant_deletions (deleted_at desc);

-- Service role only: no browser role can read or write the audit trail.
alter table public.restaurant_deletions enable row level security;
revoke all on table public.restaurant_deletions from public, anon, authenticated;

-- The customer credit ledger is append-only: these two guards refuse
-- deletes so accounting history can't be rewritten. A permanent restaurant
-- deletion is the one legitimate exception. delete_restaurant_permanently()
-- sets a transaction-local marker naming the single restaurant being purged;
-- the guards allow deletes for THAT restaurant's rows only, only inside that
-- transaction. Browser roles cannot run SQL to set it and have no delete
-- privilege on these tables; every other path behaves exactly as before.
create or replace function public.protect_customer_credit_entry()
returns trigger
language plpgsql
set search_path to ''
as $protect_customer_credit_entry$
begin
  if tg_op = 'DELETE'
     and pg_catalog.current_setting('whatsorder.purging_restaurant_id', true) = old.restaurant_id::text then
    return old;
  end if;
  raise exception 'Customer credit ledger entries are immutable';
end;
$protect_customer_credit_entry$;

create or replace function public.protect_customer_credit_shift_receipt()
returns trigger
language plpgsql
set search_path to ''
as $protect_customer_credit_shift_receipt$
begin
  if tg_op = 'DELETE'
     and pg_catalog.current_setting('whatsorder.purging_restaurant_id', true) = old.restaurant_id::text then
    return old;
  end if;
  if old.customer_credit_entry_id is not null then
    raise exception 'Customer credit receipts must be corrected from the credit ledger';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$protect_customer_credit_shift_receipt$;

-- Every public base table holding restaurant-owned rows.
create or replace function public.restaurant_owned_tables()
returns text[]
language sql
stable
security definer
set search_path = public
as $restaurant_owned_tables$
  select coalesce(array_agg(columns.table_name::text order by columns.table_name), '{}')
  from information_schema.columns as columns
  join information_schema.tables as tables
    on tables.table_schema = columns.table_schema
   and tables.table_name = columns.table_name
  where columns.table_schema = 'public'
    and columns.column_name = 'restaurant_id'
    and tables.table_type = 'BASE TABLE'
    and columns.table_name <> 'restaurants';
$restaurant_owned_tables$;

revoke all on function public.restaurant_owned_tables() from public, anon, authenticated;
grant execute on function public.restaurant_owned_tables() to service_role;

create or replace function public.export_restaurant_data(target_restaurant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $export_restaurant_data$
declare
  table_name text;
  rows jsonb;
  result jsonb;
begin
  select jsonb_build_object(
    'exported_at', now(),
    'restaurant', to_jsonb(restaurant)
  )
  into result
  from public.restaurants as restaurant
  where restaurant.id = target_restaurant_id;

  if result is null then
    raise exception 'Restaurant not found';
  end if;

  foreach table_name in array public.restaurant_owned_tables() loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(owned)), ''[]''::jsonb) from public.%I as owned where owned.restaurant_id = $1',
      table_name
    )
    into rows
    using target_restaurant_id;
    result := jsonb_set(result, array['tables', table_name], rows, true);
  end loop;

  return result;
end;
$export_restaurant_data$;

revoke all on function public.export_restaurant_data(uuid) from public, anon, authenticated;
grant execute on function public.export_restaurant_data(uuid) to service_role;

create or replace function public.delete_restaurant_permanently(
  target_restaurant_id uuid,
  confirm_slug text,
  actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $delete_restaurant_permanently$
declare
  target public.restaurants%rowtype;
  remaining text[];
  blocked text[];
  table_name text;
  passes integer := 0;
  summary jsonb;
  billing jsonb;
begin
  select * into target
  from public.restaurants
  where id = target_restaurant_id
  for update;

  if not found then
    raise exception 'Restaurant not found';
  end if;

  if target.status <> 'cancelled' then
    raise exception 'Only a cancelled restaurant can be deleted';
  end if;

  if confirm_slug is null or trim(confirm_slug) <> target.slug then
    raise exception 'The confirmation does not match the store link';
  end if;

  summary := jsonb_build_object(
    'orders', (select count(*) from public.orders where restaurant_id = target.id),
    'customers', (select count(*) from public.customers where restaurant_id = target.id),
    'menu_items', (select count(*) from public.menu_items where restaurant_id = target.id),
    'team_members', (select count(*) from public.restaurant_users where restaurant_id = target.id)
  );

  -- WhatsOrder's own billing records for this café (no customer data).
  billing := jsonb_build_object(
    'subscriptions', coalesce((select jsonb_agg(to_jsonb(r)) from public.subscriptions r where r.restaurant_id = target.id), '[]'::jsonb),
    'invoices', coalesce((select jsonb_agg(to_jsonb(r)) from public.invoices r where r.restaurant_id = target.id), '[]'::jsonb),
    'invoice_line_items', coalesce((select jsonb_agg(to_jsonb(r)) from public.invoice_line_items r where r.restaurant_id = target.id), '[]'::jsonb),
    'payments', coalesce((select jsonb_agg(to_jsonb(r)) from public.payments r where r.restaurant_id = target.id), '[]'::jsonb)
  );

  insert into public.restaurant_deletions (
    deleted_restaurant_id, restaurant_name, restaurant_slug, deleted_by, summary, billing_snapshot
  ) values (
    target.id, target.name, target.slug, actor_user_id, summary, billing
  );

  -- Allow the append-only ledger guards to release this restaurant's rows,
  -- for this transaction only (third argument true = transaction-local).
  perform pg_catalog.set_config('whatsorder.purging_restaurant_id', target.id::text, true);

  -- Delete restaurant-owned rows table by table. A table still referenced by
  -- another not-yet-deleted table fails with a foreign key violation; it is
  -- retried on the next pass once its dependents are gone.
  remaining := public.restaurant_owned_tables();
  loop
    passes := passes + 1;
    blocked := '{}';

    foreach table_name in array remaining loop
      begin
        execute format('delete from public.%I where restaurant_id = $1', table_name)
        using target.id;
      exception when foreign_key_violation then
        blocked := array_append(blocked, table_name);
      end;
    end loop;

    exit when cardinality(blocked) = 0;

    if cardinality(blocked) = cardinality(remaining) or passes >= 25 then
      raise exception 'Restaurant data could not be fully deleted (blocked: %)',
        array_to_string(blocked, ', ');
    end if;

    remaining := blocked;
  end loop;

  delete from public.restaurants where id = target.id;

  perform pg_catalog.set_config('whatsorder.purging_restaurant_id', '', true);

  return summary || jsonb_build_object('passes', passes);
end;
$delete_restaurant_permanently$;

revoke all on function public.delete_restaurant_permanently(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.delete_restaurant_permanently(uuid, text, uuid)
  to service_role;
