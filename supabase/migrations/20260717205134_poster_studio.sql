-- WhatsOrder: Poster Studio (Phase 1).
--
-- 1) public.posters — one row per rendered poster PNG. Tenant-scoped
--    read-only for members; ALL writes go through the service role (the
--    existing invariant — no insert/update/delete policies exist on purpose).
-- 2) storage bucket `posters` — private; PNGs live at
--    posters/{restaurant_id}/{poster_id}.png and are served via short-lived
--    signed URLs minted server-side after the auth guard (same posture as
--    whatsapp-media).
-- 3) public.get_bestsellers — the shared bestseller source with the
--    cold-start fallback: top items by units sold over a window, and when a
--    tenant has no order history yet, available menu items (featured first)
--    so the bestseller template is always generateable.

-- ── posters table ───────────────────────────────────────────────────────────

create table if not exists public.posters (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  template_id   text not null
    check (template_id in ('bestseller', 'offer', 'new_item', 'loyalty', 'festival')),
  subject_ref   jsonb not null,
  copy          jsonb not null,
  storage_path  text not null,
  status        text not null default 'rendered'
    check (status in ('rendered', 'sent_window', 'broadcast_queued', 'broadcast_sent')),
  created_at    timestamptz not null default now()
);

create index if not exists posters_restaurant_created_idx
  on public.posters (restaurant_id, created_at desc);

alter table public.posters enable row level security;

drop policy if exists posters_member_read on public.posters;
create policy posters_member_read
  on public.posters
  for select
  to authenticated
  using (public.is_restaurant_member(restaurant_id));

-- ── storage bucket ──────────────────────────────────────────────────────────

-- Private bucket, PNG only, capped at WhatsApp's 5 MB image limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters', 'posters', false, 5 * 1024 * 1024, array['image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── bestsellers (shared with Campaign Studio later) ─────────────────────────

create or replace function public.get_bestsellers(
  rid uuid,
  window_days integer default 30,
  limit_n integer default 5
)
returns table (menu_item_id uuid, name text, qty numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with sold as (
    select
      (it->>'item_id')::uuid as menu_item_id,
      sum(coalesce(nullif(it->>'quantity', ''), '0')::numeric) as qty
    from public.orders o
    cross join lateral jsonb_array_elements(o.items) it
    where o.restaurant_id = rid
      and o.created_at >= now() - make_interval(days => window_days)
      and o.status <> 'Cancelled'
      and it->>'item_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    group by 1
  ),
  ranked as (
    select s.menu_item_id, mi.name, s.qty
    from sold s
    join public.menu_items mi
      on mi.id = s.menu_item_id
     and mi.restaurant_id = rid
     and mi.is_available
    order by s.qty desc, mi.name
    limit limit_n
  ),
  -- Cold start: no order history yet → available items, featured first, so
  -- the poster template always has a subject.
  fallback as (
    select mi.id as menu_item_id, mi.name, 0::numeric as qty
    from public.menu_items mi
    where mi.restaurant_id = rid
      and mi.is_available
      and not exists (select 1 from ranked)
    order by mi.is_featured desc, mi.created_at
    limit limit_n
  )
  select * from ranked
  union all
  select * from fallback
$$;

-- Server-side (service role) is the only caller; keep browser JWTs out.
revoke execute on function public.get_bestsellers(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.get_bestsellers(uuid, integer, integer)
  to service_role;

-- ── self-verification ───────────────────────────────────────────────────────

do $verify_poster_studio$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'posters' and c.relrowsecurity
  ) then
    raise exception 'posters must have row level security enabled';
  end if;

  -- The only policy allowed on posters is the member SELECT; any broad write
  -- policy reappearing is the P0-3 regression this block exists to catch.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'posters'
      and cmd <> 'SELECT'
  ) then
    raise exception 'posters must not have write policies (service-role writes only)';
  end if;

  if exists (
    select 1 from storage.buckets where id = 'posters' and public = true
  ) then
    raise exception 'posters bucket must stay private';
  end if;
end;
$verify_poster_studio$;

notify pgrst, 'reload schema';
