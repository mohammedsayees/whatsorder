-- Realtime: move dashboard live updates from postgres_changes to Broadcast.
--
-- Why: Realtime's postgres_changes polls the WAL and re-checks RLS for every
-- subscriber on every change. In production that polling
-- (realtime.list_changes) was ~85% of all database time. Broadcast sends one
-- small message per relevant change to a private, per-restaurant channel,
-- and authorizes each subscriber once, when it joins.
--
-- This migration is additive and safe to apply before the new client ships:
-- old dashboard tabs keep using postgres_changes until they reload. A
-- follow-up migration removes orders / whatsapp_conversations /
-- whatsapp_messages from the supabase_realtime publication once the new
-- client is deployed.
--
-- Topics (private channels only):
--   restaurant:<restaurant_id>:orders
--     order_created  {id, status}
--     order_updated  {id, status, fulfilment_type, customer_arrived_at,
--                     online_payment_status}
--                    (only when one of those columns actually changes)
--   restaurant:<restaurant_id>:chats
--     conversation_changed {id, unread_count}
--                    (insert, or when unread_count changes)
--     message_created {id, conversation_id, direction}
--     message_updated {id, conversation_id}
--
-- Payloads carry ids and statuses only: no customer names, phones,
-- addresses or message text. Clients re-read anything else through the
-- existing server-side, tenant-scoped endpoints.
--
-- Who can receive: exactly who can SELECT those tables today
-- ("is_restaurant_member(restaurant_id) OR is_super_admin()"). No INSERT or
-- UPDATE policy is added on realtime.messages, so browsers cannot send to
-- these channels; only these database triggers can.
--
-- realtime.send swallows its own errors (RAISE WARNING), so a broadcast
-- problem can never fail an order or message write. It runs inside the
-- writing transaction, so a rolled-back write sends nothing.

-- Trigger functions ---------------------------------------------------------
-- SECURITY DEFINER so the insert into realtime.messages succeeds whichever
-- role performed the write (realtime.messages has RLS and no insert policy).
-- They are trigger functions (not callable through the API) and EXECUTE is
-- revoked from API roles below.

create or replace function public.broadcast_order_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    perform realtime.send(
      jsonb_build_object('id', new.id, 'status', new.status),
      'order_created',
      'restaurant:' || new.restaurant_id::text || ':orders',
      true
    );
  elsif new.status is distinct from old.status
     or new.customer_arrived_at is distinct from old.customer_arrived_at
     or new.online_payment_status is distinct from old.online_payment_status then
    perform realtime.send(
      jsonb_build_object(
        'id', new.id,
        'status', new.status,
        'fulfilment_type', new.fulfilment_type,
        'customer_arrived_at', new.customer_arrived_at,
        'online_payment_status', new.online_payment_status
      ),
      'order_updated',
      'restaurant:' || new.restaurant_id::text || ':orders',
      true
    );
  end if;

  return null;
end;
$function$;

create or replace function public.broadcast_whatsapp_conversation_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'INSERT'
     or new.unread_count is distinct from old.unread_count then
    perform realtime.send(
      jsonb_build_object('id', new.id, 'unread_count', new.unread_count),
      'conversation_changed',
      'restaurant:' || new.restaurant_id::text || ':chats',
      true
    );
  end if;

  return null;
end;
$function$;

create or replace function public.broadcast_whatsapp_message_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    perform realtime.send(
      jsonb_build_object(
        'id', new.id,
        'conversation_id', new.conversation_id,
        'direction', new.direction
      ),
      'message_created',
      'restaurant:' || new.restaurant_id::text || ':chats',
      true
    );
  else
    perform realtime.send(
      jsonb_build_object('id', new.id, 'conversation_id', new.conversation_id),
      'message_updated',
      'restaurant:' || new.restaurant_id::text || ':chats',
      true
    );
  end if;

  return null;
end;
$function$;

revoke all on function public.broadcast_order_change() from public, anon, authenticated;
revoke all on function public.broadcast_whatsapp_conversation_change() from public, anon, authenticated;
revoke all on function public.broadcast_whatsapp_message_change() from public, anon, authenticated;

drop trigger if exists orders_broadcast_change on public.orders;
create trigger orders_broadcast_change
after insert or update on public.orders
for each row execute function public.broadcast_order_change();

drop trigger if exists whatsapp_conversations_broadcast_change on public.whatsapp_conversations;
create trigger whatsapp_conversations_broadcast_change
after insert or update on public.whatsapp_conversations
for each row execute function public.broadcast_whatsapp_conversation_change();

drop trigger if exists whatsapp_messages_broadcast_change on public.whatsapp_messages;
create trigger whatsapp_messages_broadcast_change
after insert or update on public.whatsapp_messages
for each row execute function public.broadcast_whatsapp_message_change();

-- Who may receive -----------------------------------------------------------
-- Returns the restaurant id for a well-formed dashboard topic, else null.
-- A CASE guards the uuid cast, so a malformed topic can never raise inside
-- the policy; it simply matches nothing.
create or replace function public.realtime_topic_restaurant_id(topic text)
returns uuid
language sql
immutable
set search_path to ''
as $function$
  select case
    when topic ~ '^restaurant:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(orders|chats)$'
      then split_part(topic, ':', 2)::uuid
  end;
$function$;

revoke all on function public.realtime_topic_restaurant_id(text) from public, anon;
grant execute on function public.realtime_topic_restaurant_id(text) to authenticated, service_role;

drop policy if exists "Restaurant members receive their dashboard broadcasts" on realtime.messages;
create policy "Restaurant members receive their dashboard broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and public.realtime_topic_restaurant_id((select realtime.topic())) is not null
  and (
    public.is_restaurant_member(public.realtime_topic_restaurant_id((select realtime.topic())))
    or public.is_super_admin()
  )
);

-- Self-verification ---------------------------------------------------------
do $verify_realtime_broadcast$
begin
  -- Browsers must never be able to send on these channels.
  if exists (
    select 1 from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and (roles && array['anon', 'authenticated', 'public']::name[])
  ) then
    raise exception 'realtime.messages must not have write policies for API roles';
  end if;

  -- Malformed topics resolve to no restaurant.
  if public.realtime_topic_restaurant_id('restaurant:not-a-uuid:orders') is not null
     or public.realtime_topic_restaurant_id('restaurant:00000000-0000-4000-8000-000000000001:other') is not null
     or public.realtime_topic_restaurant_id('x') is not null
     or public.realtime_topic_restaurant_id(null) is not null then
    raise exception 'realtime_topic_restaurant_id accepted a malformed topic';
  end if;

  if public.realtime_topic_restaurant_id('restaurant:00000000-0000-4000-8000-000000000001:orders')
     is distinct from '00000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'realtime_topic_restaurant_id rejected a valid topic';
  end if;

  if (select count(*) from pg_trigger
      where not tgisinternal
        and tgname in (
          'orders_broadcast_change',
          'whatsapp_conversations_broadcast_change',
          'whatsapp_messages_broadcast_change'
        )) <> 3 then
    raise exception 'broadcast triggers missing';
  end if;
end;
$verify_realtime_broadcast$;
