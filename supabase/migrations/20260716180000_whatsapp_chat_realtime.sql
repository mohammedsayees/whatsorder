-- WhatsOrder: WhatsApp chat inbox (Phase 2a) — realtime events for chat messages.
--
-- Adds whatsapp_messages to the supabase_realtime publication so the admin
-- chats page can subscribe to INSERT/UPDATE via postgres_changes, mirroring
-- how orders power the new-order alerts. Delivery is RLS-gated per subscriber:
-- authenticated members only receive rows their tenant-scoped SELECT policy
-- allows (see 20260716120000), so no cross-tenant events leak.

do $add_realtime$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_messages'
  ) then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;
end;
$add_realtime$;
