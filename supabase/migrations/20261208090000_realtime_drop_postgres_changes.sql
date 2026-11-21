-- Realtime step 2: stop postgres_changes for dashboard tables.
--
-- 20261207090000_realtime_broadcast_triggers.sql moved the dashboard to
-- private Broadcast channels, and that client is deployed (PR #153).
-- Removing these tables from the supabase_realtime publication stops
-- Realtime from polling the WAL for them (realtime.list_changes), which was
-- ~85% of production database time.
--
-- Applied only after confirming no postgres_changes subscriptions remain
-- (realtime.subscription was empty), so no open dashboard loses updates.
-- Rollback, if ever needed: re-add the tables with
--   alter publication supabase_realtime add table public.<table>;

do $drop_dashboard_tables_from_realtime$
declare
  dashboard_table text;
begin
  foreach dashboard_table in array array[
    'orders', 'whatsapp_conversations', 'whatsapp_messages'
  ] loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = dashboard_table
    ) then
      execute format(
        'alter publication supabase_realtime drop table public.%I',
        dashboard_table
      );
    end if;
  end loop;
end;
$drop_dashboard_tables_from_realtime$;

do $verify_dashboard_tables_off_realtime$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('orders', 'whatsapp_conversations', 'whatsapp_messages')
  ) then
    raise exception 'dashboard tables are still published to supabase_realtime';
  end if;

  -- Live updates now depend on the Broadcast triggers; refuse to leave the
  -- dashboard without them.
  if (select count(*) from pg_trigger
      where not tgisinternal
        and tgname in (
          'orders_broadcast_change',
          'whatsapp_conversations_broadcast_change',
          'whatsapp_messages_broadcast_change'
        )) <> 3 then
    raise exception 'Broadcast triggers missing; dashboard would lose live updates';
  end if;
end;
$verify_dashboard_tables_off_realtime$;
