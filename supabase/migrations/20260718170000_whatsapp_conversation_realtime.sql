-- Publish tenant-scoped conversation unread-count changes so the persistent
-- admin navigation can update its Chats badge on every admin page. Delivery
-- remains RLS-gated by the existing authenticated SELECT policy; writes remain
-- service-role only.

do $add_conversation_realtime$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_conversations'
  ) then
    alter publication supabase_realtime
      add table public.whatsapp_conversations;
  end if;
end;
$add_conversation_realtime$;
