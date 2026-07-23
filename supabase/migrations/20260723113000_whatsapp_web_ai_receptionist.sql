-- WhatsOrder: tenant-scoped WhatsApp Web connection + AI receptionist.
--
-- The persistent connector keeps WhatsApp Web credentials outside Supabase.
-- This database stores only connection metadata, an ephemeral QR payload, and
-- per-restaurant chatbot settings. All writes remain service-role only.

create table if not exists public.whatsapp_integrations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(id) on delete cascade,
  provider text not null default 'whatsapp_web'
    check (provider in ('whatsapp_web', 'cloud_api')),
  status text not null default 'disconnected'
    check (status in ('disconnected', 'connecting', 'qr_ready', 'active', 'error')),
  phone_number text,
  display_name text,
  connector_session_id text unique,
  qr_payload text,
  qr_expires_at timestamptz,
  connected_at timestamptz,
  last_seen_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_integrations_connector_session
on public.whatsapp_integrations(connector_session_id)
where connector_session_id is not null;

create table if not exists public.whatsapp_chatbot_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  enabled boolean not null default false,
  answer_text boolean not null default true,
  answer_audio boolean not null default true,
  language_mode text not null default 'customer'
    check (language_mode in ('customer', 'english', 'arabic', 'malayalam')),
  tone text not null default 'friendly'
    check (tone in ('friendly', 'concise', 'formal')),
  welcome_message text,
  handoff_message text not null default
    'I am passing this conversation to our team. Someone will reply shortly.',
  human_pause_minutes integer not null default 480
    check (human_pause_minutes between 15 and 10080),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_conversations
  add column if not exists automation_state text not null default 'active'
    check (automation_state in ('active', 'paused')),
  add column if not exists automation_paused_until timestamptz,
  add column if not exists last_bot_reply_at timestamptz;

alter table public.whatsapp_integrations enable row level security;
alter table public.whatsapp_chatbot_settings enable row level security;

drop policy if exists "Managers can read WhatsApp integrations"
on public.whatsapp_integrations;
create policy "Managers can read WhatsApp integrations"
on public.whatsapp_integrations for select
to authenticated
using (
  public.is_restaurant_member(
    whatsapp_integrations.restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
  or public.is_super_admin()
);

drop policy if exists "Managers can read chatbot settings"
on public.whatsapp_chatbot_settings;
create policy "Managers can read chatbot settings"
on public.whatsapp_chatbot_settings for select
to authenticated
using (
  public.is_restaurant_member(
    whatsapp_chatbot_settings.restaurant_id,
    array['restaurant_admin', 'owner', 'manager']
  )
  or public.is_super_admin()
);

revoke all on table public.whatsapp_integrations from anon, authenticated;
revoke all on table public.whatsapp_chatbot_settings from anon, authenticated;
grant select on table public.whatsapp_integrations to authenticated;
grant select on table public.whatsapp_chatbot_settings to authenticated;

do $verify_whatsapp_web_ai$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('whatsapp_integrations', 'whatsapp_chatbot_settings')
      and cmd <> 'SELECT'
  ) then
    raise exception 'WhatsApp integration tables must remain service-role write only';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('whatsapp_integrations', 'whatsapp_chatbot_settings')
      and (roles @> array['public'::name] or roles @> array['anon'::name])
  ) then
    raise exception 'WhatsApp integration policies must not target public or anon';
  end if;
end;
$verify_whatsapp_web_ai$;

notify pgrst, 'reload schema';
