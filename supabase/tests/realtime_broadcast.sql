\set ON_ERROR_STOP on

-- Realtime Broadcast for dashboard live updates
-- (20261207090000_realtime_broadcast_triggers.sql). Rollback-only.

begin;

insert into auth.users (id, email, role, aud, created_at, updated_at) values
  ('1b000000-0000-0000-0000-000000000001', 'rt-staff-a@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('1b000000-0000-0000-0000-000000000002', 'rt-owner-b@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('1b000000-0000-0000-0000-000000000003', 'rt-super@test.invalid', 'authenticated', 'authenticated', now(), now()),
  ('1b000000-0000-0000-0000-000000000004', 'rt-nobody@test.invalid', 'authenticated', 'authenticated', now(), now());

insert into public.restaurants (id, name, slug, whatsapp_number, status, is_active) values
  ('2b000000-0000-0000-0000-000000000001', 'Realtime A', 'rt-tenant-a', '971500000301', 'live', true),
  ('2b000000-0000-0000-0000-000000000002', 'Realtime B', 'rt-tenant-b', '971500000302', 'live', true);

insert into public.restaurant_users (id, restaurant_id, user_id, email, role, accepted_at) values
  ('3b000000-0000-0000-0000-000000000001', '2b000000-0000-0000-0000-000000000001', '1b000000-0000-0000-0000-000000000001', 'rt-staff-a@test.invalid', 'staff', now()),
  ('3b000000-0000-0000-0000-000000000002', '2b000000-0000-0000-0000-000000000002', '1b000000-0000-0000-0000-000000000002', 'rt-owner-b@test.invalid', 'owner', now());

update public.profiles set role = 'super_admin' where id = '1b000000-0000-0000-0000-000000000003';

-- Writes happen through the service role, as in production.
insert into public.orders (
  id, restaurant_id, customer_name, customer_phone, fulfilment_type, items,
  subtotal, delivery_fee, total, status, whatsapp_message,
  consent_order_processing, consent_timestamp
) values (
  '4b000000-0000-4000-8000-000000000001', '2b000000-0000-0000-0000-000000000001',
  'Private Name', '971500000399', 'takeaway', '[]', 5, 0, 5, 'New', 't', true, now()
);

insert into public.whatsapp_conversations (id, restaurant_id, customer_phone, customer_name)
values ('5b000000-0000-0000-0000-000000000001', '2b000000-0000-0000-0000-000000000001', '971500000398', 'Chat Name');

insert into public.whatsapp_messages (restaurant_id, conversation_id, direction)
values ('2b000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', 'inbound');

do $emit_checks$
declare
  orders_topic constant text := 'restaurant:2b000000-0000-0000-0000-000000000001:orders';
  chats_topic constant text := 'restaurant:2b000000-0000-0000-0000-000000000001:chats';
  created jsonb;
begin
  select payload into created from realtime.messages
  where topic = orders_topic and event = 'order_created';
  if created is null then
    raise exception 'Order insert must broadcast order_created on the tenant topic';
  end if;
  if created ->> 'id' <> '4b000000-0000-4000-8000-000000000001'
     or created ->> 'status' <> 'New' then
    raise exception 'order_created payload wrong: %', created;
  end if;
  if created::text like '%Private Name%' or created::text like '%971500000399%' then
    raise exception 'Broadcast payloads must not carry customer PII: %', created;
  end if;

  -- Unrelated column changes stay quiet.
  update public.orders set notes = 'extra napkins'
  where id = '4b000000-0000-4000-8000-000000000001';
  if exists (select 1 from realtime.messages where topic = orders_topic and event = 'order_updated') then
    raise exception 'A notes-only update must not broadcast';
  end if;

  update public.orders set status = 'Preparing'
  where id = '4b000000-0000-4000-8000-000000000001';
  if not exists (
    select 1 from realtime.messages
    where topic = orders_topic and event = 'order_updated'
      and payload ->> 'status' = 'Preparing'
      and payload ? 'online_payment_status'
      and payload ? 'customer_arrived_at'
      and payload ->> 'fulfilment_type' = 'takeaway'
  ) then
    raise exception 'A status change must broadcast order_updated';
  end if;

  if not exists (
    select 1 from realtime.messages
    where topic = chats_topic and event = 'conversation_changed'
      and payload ->> 'id' = '5b000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Conversation insert must broadcast conversation_changed';
  end if;

  update public.whatsapp_conversations set customer_name = 'Renamed'
  where id = '5b000000-0000-0000-0000-000000000001';
  if (select count(*) from realtime.messages
      where topic = chats_topic and event = 'conversation_changed') <> 1 then
    raise exception 'Only unread_count changes should re-broadcast a conversation';
  end if;

  update public.whatsapp_conversations set unread_count = unread_count + 1
  where id = '5b000000-0000-0000-0000-000000000001';
  if (select count(*) from realtime.messages
      where topic = chats_topic and event = 'conversation_changed') <> 2 then
    raise exception 'An unread_count change must broadcast conversation_changed';
  end if;

  if not exists (
    select 1 from realtime.messages
    where topic = chats_topic and event = 'message_created'
      and payload ->> 'direction' = 'inbound'
      and payload ->> 'conversation_id' = '5b000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Message insert must broadcast message_created';
  end if;
  if exists (
    select 1 from realtime.messages
    where topic = chats_topic and payload::text like '%Chat Name%'
  ) then
    raise exception 'Chat broadcasts must not carry customer names';
  end if;

  -- Step 2: dashboard tables no longer feed postgres_changes.
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('orders', 'whatsapp_conversations', 'whatsapp_messages')
  ) then
    raise exception 'Dashboard tables must not be in the supabase_realtime publication';
  end if;

  -- Tenant B saw nothing.
  if exists (select 1 from realtime.messages where topic like 'restaurant:2b000000-0000-0000-0000-000000000002:%') then
    raise exception 'Tenant A writes must not reach tenant B topics';
  end if;
end;
$emit_checks$;

-- Who may receive: Realtime authorizes a join by running a SELECT on
-- realtime.messages as the user with realtime.topic set to the channel.
reset role;
set local role authenticated;

-- Staff member of A: A's topics yes, B's topics no.
select set_config('request.jwt.claim.sub', '1b000000-0000-0000-0000-000000000001', true);
select set_config('realtime.topic', 'restaurant:2b000000-0000-0000-0000-000000000001:orders', true);
do $$ begin
  if (select count(*) from realtime.messages) = 0 then
    raise exception 'A member must be able to join its own orders topic';
  end if;
end $$;
select set_config('realtime.topic', 'restaurant:2b000000-0000-0000-0000-000000000001:chats', true);
do $$ begin
  if (select count(*) from realtime.messages) = 0 then
    raise exception 'A member must be able to join its own chats topic';
  end if;
end $$;
select set_config('realtime.topic', 'restaurant:2b000000-0000-0000-0000-000000000002:orders', true);
do $$ begin
  if (select count(*) from realtime.messages) <> 0 then
    raise exception 'A member must not join another tenant''s topic';
  end if;
end $$;

-- Malformed or unknown topics match nothing and never raise.
select set_config('realtime.topic', 'restaurant:not-a-uuid:orders', true);
do $$ begin
  if (select count(*) from realtime.messages) <> 0 then
    raise exception 'Malformed topic must match nothing';
  end if;
end $$;
select set_config('realtime.topic', 'restaurant:2b000000-0000-0000-0000-000000000001:secrets', true);
do $$ begin
  if (select count(*) from realtime.messages) <> 0 then
    raise exception 'Unknown topic suffix must match nothing';
  end if;
end $$;

-- Owner of B cannot join A.
select set_config('request.jwt.claim.sub', '1b000000-0000-0000-0000-000000000002', true);
select set_config('realtime.topic', 'restaurant:2b000000-0000-0000-0000-000000000001:orders', true);
do $$ begin
  if (select count(*) from realtime.messages) <> 0 then
    raise exception 'Another tenant''s owner must not join A';
  end if;
end $$;

-- A signed-in user with no membership cannot join.
select set_config('request.jwt.claim.sub', '1b000000-0000-0000-0000-000000000004', true);
do $$ begin
  if (select count(*) from realtime.messages) <> 0 then
    raise exception 'Non-members must not join';
  end if;
end $$;

-- Super admins can, matching the table read policies.
select set_config('request.jwt.claim.sub', '1b000000-0000-0000-0000-000000000003', true);
do $$ begin
  if (select count(*) from realtime.messages) = 0 then
    raise exception 'Super admins must be able to join';
  end if;
end $$;

-- Browsers can never send on these channels.
do $$ begin
  begin
    insert into realtime.messages (topic, extension, payload, event, private)
    values ('restaurant:2b000000-0000-0000-0000-000000000001:orders', 'broadcast', '{}', 'order_created', true);
    raise exception 'Authenticated users must not insert broadcasts';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Anonymous users cannot join at all.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('realtime.topic', 'restaurant:2b000000-0000-0000-0000-000000000001:orders', true);
do $$ begin
  begin
    if (select count(*) from realtime.messages) <> 0 then
      raise exception 'Anonymous users must not join';
    end if;
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
rollback;
