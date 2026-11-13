-- Run after all migrations. Exercises 20261115090000_tenant_isolation_hardening:
-- service-role-only tables, internal notes moved off restaurants, slug history.
-- Everything rolls back.
begin;

do $tenant_isolation_hardening_test$
declare
  a_id uuid := gen_random_uuid();
  b_id uuid := gen_random_uuid();
  t text;
  rejected boolean;
  notes_in_column text;
  notes_in_table text;
begin
  foreach t in array array[
    'customer_link_token_uses', 'customer_session_revocations',
    'restaurant_internal_notes', 'restaurant_slug_history'
  ] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || t)::regclass) then
      raise exception '% does not have RLS enabled', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'select')
       or has_table_privilege('authenticated', 'public.' || t, 'select') then
      raise exception 'Browser roles can read %', t;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = t) then
      raise exception '% has a policy; it must be service-role only', t;
    end if;
  end loop;

  insert into public.restaurants (id, name, slug, whatsapp_number)
  values (a_id, 'Slug Cafe A', 'slug-test-cafe-a', '971551150068'),
         (b_id, 'Slug Cafe B', 'slug-test-cafe-b', '971551150069');

  -- 14: notes written the old way land in the new table, never on the row.
  update public.restaurants set internal_notes = 'late payer' where id = a_id;
  select internal_notes into notes_in_column from public.restaurants where id = a_id;
  select notes into notes_in_table from public.restaurant_internal_notes where restaurant_id = a_id;
  if notes_in_column is not null or notes_in_table is distinct from 'late payer' then
    raise exception 'Internal notes were not moved (column %, table %)', notes_in_column, notes_in_table;
  end if;
  update public.restaurants set internal_notes = '' where id = a_id;
  if exists (select 1 from public.restaurant_internal_notes where restaurant_id = a_id) then
    raise exception 'Clearing notes did not remove them';
  end if;

  -- 16: a renamed restaurant keeps its old slug; nobody else can take it.
  update public.restaurants set slug = 'slug-test-cafe-a-new' where id = a_id;
  if not exists (
    select 1 from public.restaurant_slug_history
    where slug = 'slug-test-cafe-a' and restaurant_id = a_id
  ) then
    raise exception 'Old slug was not recorded in history';
  end if;

  rejected := false;
  begin
    update public.restaurants set slug = 'slug-test-cafe-a' where id = b_id;
  exception when unique_violation then
    rejected := sqlerrm like '%store link is already taken%';
  end;
  if not rejected then
    raise exception 'Another restaurant could take a released slug';
  end if;

  rejected := false;
  begin
    insert into public.restaurants (name, slug, whatsapp_number)
    values ('Squatter', 'slug-test-cafe-a', '971551150070');
  exception when unique_violation then
    rejected := true;
  end;
  if not rejected then
    raise exception 'A new restaurant could take a released slug';
  end if;

  -- The original owner may move back to its old slug.
  update public.restaurants set slug = 'slug-test-cafe-a' where id = a_id;

  -- Demo slugs are not reserved.
  update public.restaurants set slug = 'demo-slug-test-x1' where id = b_id;
  update public.restaurants set slug = 'slug-test-cafe-b2' where id = b_id;
  if exists (select 1 from public.restaurant_slug_history where slug = 'demo-slug-test-x1') then
    raise exception 'A demo slug was reserved';
  end if;

  -- Indexes for cascade deletes and rate-limit cleanup.
  foreach t in array array[
    'idx_order_status_events_order_id', 'idx_order_print_events_order_id',
    'idx_order_payment_events_order_id', 'idx_order_submission_keys_order_id',
    'idx_order_notification_jobs_order_id', 'idx_order_submission_attempts_created_at'
  ] loop
    if to_regclass('public.' || t) is null then
      raise exception 'Index % is missing', t;
    end if;
  end loop;
end
$tenant_isolation_hardening_test$;

rollback;
