-- WhatsOrder: operational controls for the WhatsApp inbox.
--
-- Adds tenant-scoped assignment and handoff state to conversations, and an
-- explicit sender type to messages so the inbox can distinguish customer,
-- AI, staff, and system messages. Existing RLS remains SELECT-only for
-- authenticated restaurant members; all writes continue through service-role
-- server actions.

alter table public.whatsapp_conversations
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists handoff_requested_at timestamptz,
  add column if not exists handoff_reason text,
  add column if not exists last_message_direction text
    check (last_message_direction in ('inbound', 'outbound'));

alter table public.whatsapp_messages
  add column if not exists sender_type text
    check (sender_type in ('customer', 'ai', 'staff', 'system'));

update public.whatsapp_messages
set sender_type = case
  when direction = 'inbound' then 'customer'
  when sent_by is not null then 'staff'
  else 'system'
end
where sender_type is null;

with latest as (
  select distinct on (conversation_id, restaurant_id)
    conversation_id,
    restaurant_id,
    direction
  from public.whatsapp_messages
  order by conversation_id, restaurant_id, created_at desc
)
update public.whatsapp_conversations as conversation
set last_message_direction = latest.direction
from latest
where latest.conversation_id = conversation.id
  and latest.restaurant_id = conversation.restaurant_id
  and conversation.last_message_direction is null;

alter table public.whatsapp_chatbot_settings
  drop constraint if exists whatsapp_chatbot_settings_human_pause_minutes_check;

alter table public.whatsapp_chatbot_settings
  add constraint whatsapp_chatbot_settings_human_pause_minutes_check
  check (human_pause_minutes between 0 and 10080);

create index if not exists idx_whatsapp_conversations_assignment
on public.whatsapp_conversations(restaurant_id, assigned_to, status, last_message_at desc);

create index if not exists idx_whatsapp_conversations_handoff
on public.whatsapp_conversations(restaurant_id, handoff_requested_at desc)
where handoff_requested_at is not null;

create index if not exists idx_whatsapp_messages_sender_metrics
on public.whatsapp_messages(restaurant_id, sender_type, created_at desc);

do $verify_whatsapp_operations$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('whatsapp_conversations', 'whatsapp_messages')
      and cmd <> 'SELECT'
  ) then
    raise exception 'WhatsApp operational tables must remain service-role write only';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('whatsapp_conversations', 'whatsapp_messages')
      and (roles @> array['public'::name] or roles @> array['anon'::name])
  ) then
    raise exception 'WhatsApp operational policies must not target public or anon';
  end if;
end;
$verify_whatsapp_operations$;

notify pgrst, 'reload schema';
