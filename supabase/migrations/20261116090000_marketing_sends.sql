-- WhatsOrder: marketing send ledger (Marketing Phase 1 — compliance and
-- send reliability).
--
-- public.marketing_sends — one row per (poster, recipient). The send pipeline
-- inserts every recipient as `queued` FIRST, then atomically claims each row
-- (queued/failed → sending) before calling WhatsApp, and records the outcome.
--
--   * unique (poster_id, customer_phone): a retry, a double click or two
--     concurrent invocations can never send the same poster to the same
--     customer twice.
--   * (restaurant_id, customer_phone, sent_at) index: the 24h frequency cap
--     ("no more than one marketing send per customer per day") reads this.
--   * poster_id references posters ON DELETE RESTRICT: a poster that was ever
--     queued for a customer is part of the audit trail and cannot be deleted
--     (Phase 2 retention cleanup relies on this).
--   * (poster_id, restaurant_id) is a composite FK, so a send row can only
--     point at a poster of the same tenant.
--
-- Tenant-scoped read-only for members; ALL writes go through the service role
-- (no insert/update/delete policies exist on purpose).

-- Composite key target so marketing_sends can pin poster + tenant together.
alter table public.posters
  drop constraint if exists posters_id_restaurant_key;
alter table public.posters
  add constraint posters_id_restaurant_key unique (id, restaurant_id);

create table if not exists public.marketing_sends (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  poster_id       uuid not null,
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  -- digits-only, same convention as customers.phone / whatsapp_conversations
  customer_phone  text not null check (customer_phone ~ '^[0-9]{6,20}$'),
  -- queued   → inserted, not yet attempted (or not reached within the budget)
  -- sending  → claimed by one invocation; WhatsApp call in flight. Counted by
  --            the frequency cap so an interrupted send fails closed.
  -- sent     → WhatsApp accepted it (wa_message_id set)
  -- failed   → WhatsApp rejected it; a later invocation may retry
  -- skipped  → no longer eligible when retried (consent withdrawn, window
  --            closed or frequency cap); never sent
  status          text not null default 'queued'
    check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  -- The exact caption sent (AI text + code-appended opt-out line).
  caption         text check (caption is null or char_length(caption) <= 1024),
  wa_message_id   text,
  error           text check (error is null or char_length(error) <= 500),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz,
  constraint marketing_sends_poster_fk
    foreign key (poster_id, restaurant_id)
    references public.posters (id, restaurant_id)
    on delete restrict,
  constraint marketing_sends_poster_phone_key
    unique (poster_id, customer_phone),
  constraint marketing_sends_sent_has_wamid
    check (status <> 'sent' or (wa_message_id is not null and sent_at is not null))
);

create index if not exists marketing_sends_restaurant_phone_sent_idx
  on public.marketing_sends (restaurant_id, customer_phone, sent_at desc);

create index if not exists marketing_sends_restaurant_poster_idx
  on public.marketing_sends (restaurant_id, poster_id);

alter table public.marketing_sends enable row level security;

drop policy if exists marketing_sends_member_read on public.marketing_sends;
create policy marketing_sends_member_read
  on public.marketing_sends
  for select
  to authenticated
  using (public.is_restaurant_member(restaurant_id));

-- ── self-verification ───────────────────────────────────────────────────────

do $verify_marketing_sends$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'marketing_sends' and c.relrowsecurity
  ) then
    raise exception 'marketing_sends must have row level security enabled';
  end if;

  -- The only policy allowed is the member SELECT; a broad write policy
  -- reappearing is the P0-3 regression this block exists to catch.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'marketing_sends'
      and cmd <> 'SELECT'
  ) then
    raise exception 'marketing_sends must not have write policies (service-role writes only)';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.marketing_sends'::regclass
      and conname = 'marketing_sends_poster_phone_key'
      and contype = 'u'
  ) then
    raise exception 'marketing_sends must be unique per (poster_id, customer_phone)';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.marketing_sends'::regclass
      and conname = 'marketing_sends_poster_fk'
      and confdeltype = 'r'
  ) then
    raise exception 'marketing_sends must restrict poster deletion';
  end if;
end;
$verify_marketing_sends$;

notify pgrst, 'reload schema';
