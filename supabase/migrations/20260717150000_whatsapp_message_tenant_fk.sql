-- WhatsOrder: enforce tenant consistency between WhatsApp messages and their
-- parent conversations. Service-role code already writes both restaurant_id
-- values, but the database must reject a cross-tenant pair independently.

alter table public.whatsapp_conversations
  add constraint whatsapp_conversations_id_restaurant_id_key
  unique (id, restaurant_id);

alter table public.whatsapp_messages
  drop constraint whatsapp_messages_conversation_id_fkey;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_conversation_restaurant_fkey
  foreign key (conversation_id, restaurant_id)
  references public.whatsapp_conversations(id, restaurant_id)
  on delete cascade;

do $verify_whatsapp_message_tenant_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.whatsapp_messages'::regclass
      and conname = 'whatsapp_messages_conversation_restaurant_fkey'
      and contype = 'f'
  ) then
    raise exception 'tenant-consistent WhatsApp message foreign key missing';
  end if;
end;
$verify_whatsapp_message_tenant_fk$;
