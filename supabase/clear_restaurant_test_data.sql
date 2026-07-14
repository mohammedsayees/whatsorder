-- WhatsOrder pre-launch transactional data cleanup
--
-- PURPOSE
--   Remove test orders, customers, loyalty activity, feedback, and order-submission
--   protection records for ONE restaurant without changing its menu, settings,
--   users, offers, onboarding, or Supabase Auth accounts.
--
-- SAFE WORKFLOW
--   1. Take a Supabase backup.
--   2. Find the restaurant identity if needed:
--        select id, name, slug from public.restaurants order by name;
--   3. Replace BOTH placeholders below with the restaurant UUID and slug.
--   4. Keep execute_cleanup := false and run once to preview row counts.
--   5. Confirm the restaurant name, slug, and counts shown in Messages.
--   6. Change execute_cleanup := true and run again.
--   7. Change it back to false after the cleanup.
--
-- IMPORTANT
--   This permanently deletes all transactional history for the selected tenant.
--   Do not use it after real customer orders have started.

begin;

do $cleanup$
declare
  -- Required double confirmation. Replace both values before running.
  target_restaurant_id_text constant text := 'REPLACE_WITH_RESTAURANT_UUID';
  expected_restaurant_slug constant text := 'REPLACE_WITH_RESTAURANT_SLUG';

  -- Safety default: false only previews counts; true performs deletion.
  execute_cleanup constant boolean := false;

  target_restaurant_id uuid;
  target_restaurant_name text;
  actual_restaurant_slug text;
  target_table text;
  affected_rows bigint;
  preview_tables constant text[] := array[
    'customer_feedback',
    'feedback_requests',
    'loyalty_transactions',
    'order_submission_keys',
    'order_submission_attempts',
    'orders',
    'customers'
  ];
  deletion_tables constant text[] := array[
    'customer_feedback',
    'feedback_requests',
    'loyalty_transactions',
    'order_submission_keys',
    'order_submission_attempts',
    'orders',
    'customers'
  ];
begin
  if target_restaurant_id_text = 'REPLACE_WITH_RESTAURANT_UUID'
     or expected_restaurant_slug = 'REPLACE_WITH_RESTAURANT_SLUG' then
    raise exception
      'Replace both restaurant placeholders before running this script.';
  end if;

  begin
    target_restaurant_id := target_restaurant_id_text::uuid;
  exception
    when invalid_text_representation then
      raise exception 'The restaurant ID is not a valid UUID.';
  end;

  select restaurant.name, restaurant.slug
  into target_restaurant_name, actual_restaurant_slug
  from public.restaurants restaurant
  where restaurant.id = target_restaurant_id;

  if not found then
    raise exception
      'No restaurant exists with ID %.',
      target_restaurant_id;
  end if;

  if actual_restaurant_slug <> expected_restaurant_slug then
    raise exception
      'Safety check failed: restaurant ID belongs to slug "%", not "%".',
      actual_restaurant_slug,
      expected_restaurant_slug;
  end if;

  raise notice 'Target restaurant: % (% / %)',
    target_restaurant_name,
    actual_restaurant_slug,
    target_restaurant_id;
  raise notice 'Cleanup mode: %',
    case when execute_cleanup then 'DELETE' else 'PREVIEW ONLY' end;

  foreach target_table in array preview_tables loop
    if to_regclass(format('public.%I', target_table)) is null then
      raise notice '%: table is not installed; skipped', target_table;
      continue;
    end if;

    execute format(
      'select count(*) from public.%I where restaurant_id = $1',
      target_table
    )
    into affected_rows
    using target_restaurant_id;

    raise notice '%: % row(s)', target_table, affected_rows;
  end loop;

  if not execute_cleanup then
    raise notice
      'Preview complete. No data was deleted. Set execute_cleanup to true only after checking these counts.';
    return;
  end if;

  foreach target_table in array deletion_tables loop
    if to_regclass(format('public.%I', target_table)) is null then
      continue;
    end if;

    execute format(
      'delete from public.%I where restaurant_id = $1',
      target_table
    )
    using target_restaurant_id;

    get diagnostics affected_rows = row_count;
    raise notice 'Deleted % row(s) from %', affected_rows, target_table;
  end loop;

  raise notice
    'Cleanup completed for % (%). Menu, settings, offers, users, and Auth accounts were preserved.',
    target_restaurant_name,
    actual_restaurant_slug;
end;
$cleanup$;

commit;

-- Optional verification after the DELETE run:
-- Replace the UUID below, then run this SELECT separately.
--
-- select
--   (select count(*) from public.orders where restaurant_id = 'REPLACE_WITH_RESTAURANT_UUID') as orders,
--   (select count(*) from public.customers where restaurant_id = 'REPLACE_WITH_RESTAURANT_UUID') as customers,
--   (select count(*) from public.loyalty_transactions where restaurant_id = 'REPLACE_WITH_RESTAURANT_UUID') as loyalty_transactions;
