-- WhatsOrder: WhatsApp chat inbox (Phase 1) — persist conversations + messages.
--
-- The Cloud API webhook currently replies-and-forgets: it upserts the 24h
-- service window and sends a deep link, but stores no message content. Phase 1
-- adds durable chat history so /admin/chats can render an inbox:
--
--   whatsapp_conversations — one row per (restaurant, customer phone); carries
--     open/closed status, unread count and last-message denormalisations so the
--     inbox list renders without scanning messages.
--   whatsapp_messages — every inbound message and every outbound send (manual
--     replies + the automated deep-link reply), deduped on Meta's message id
--     because Meta redelivers webhooks on slow/failed acks.
--
-- Security model mirrors order_payment_events: RLS enabled, SELECT-only for
-- authenticated members (role-scoped — anon must never evaluate the membership
-- helpers, see 20260702130000), all writes via service-role server code.

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  -- digits-only, same convention as customers.phone / whatsapp_service_windows
  customer_phone text not null,
  -- WhatsApp profile name from the inbound contacts payload (customer-set)
  customer_name text,
  status text not null default 'open' check (status in ('open', 'closed')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_inbound_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, customer_phone)
);

create index if not exists idx_whatsapp_conversations_inbox
on public.whatsapp_conversations(restaurant_id, status, last_message_at desc);

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.whatsapp_conversations(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  -- Meta's message id (wamid.…) — used to dedupe webhook redeliveries.
  -- Null for outbound rows recorded before the send response is known.
  wa_message_id text,
  -- Meta message type (text, image, audio, location, …). Non-text bodies are
  -- stored as placeholders in phase 1; media download is phase 2.
  message_type text not null default 'text',
  body text not null default '',
  -- outbound delivery status (sent/delivered/read/failed) — populated when the
  -- `statuses` webhook field is subscribed (phase 2)
  status text,
  -- staff member who sent an outbound reply; null for inbound and automated sends
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_whatsapp_messages_wa_message_id
on public.whatsapp_messages(wa_message_id)
where wa_message_id is not null;

create index if not exists idx_whatsapp_messages_thread
on public.whatsapp_messages(conversation_id, created_at);

alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;

drop policy if exists "Members and super admins can read conversations"
on public.whatsapp_conversations;
create policy "Members and super admins can read conversations"
on public.whatsapp_conversations for select
to authenticated
using (
  public.is_restaurant_member(whatsapp_conversations.restaurant_id)
  or public.is_super_admin()
);

drop policy if exists "Members and super admins can read chat messages"
on public.whatsapp_messages;
create policy "Members and super admins can read chat messages"
on public.whatsapp_messages for select
to authenticated
using (
  public.is_restaurant_member(whatsapp_messages.restaurant_id)
  or public.is_super_admin()
);

revoke all on table public.whatsapp_conversations from anon, authenticated;
revoke all on table public.whatsapp_messages from anon, authenticated;
grant select on table public.whatsapp_conversations to authenticated;
grant select on table public.whatsapp_messages to authenticated;

do $verify_chat_inbox$
begin
  -- Writes must stay service-role only.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('whatsapp_conversations', 'whatsapp_messages')
      and cmd <> 'SELECT'
  ) then
    raise exception 'whatsapp chat inbox tables must not have write policies';
  end if;

  -- No policy may target role public/anon: anon cannot execute the membership
  -- helpers, and evaluating them as anon breaks the query outright.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('whatsapp_conversations', 'whatsapp_messages')
      and (roles @> array['public'::name] or roles @> array['anon'::name])
  ) then
    raise exception 'whatsapp chat inbox policies must be scoped to authenticated only';
  end if;
end;
$verify_chat_inbox$;

notify pgrst, 'reload schema';
