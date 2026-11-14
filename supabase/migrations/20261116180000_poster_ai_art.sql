-- WhatsOrder: Poster Studio AI artwork (Marketing Phase 6).
--
-- 1) ai_image_generations.purpose — the existing AI image log now also records
--    poster artwork, so each feature keeps its own daily cap:
--      menu_photo        → menu editor "AI image" (existing rows)
--      poster_cutout     → studio cut-out of a dish photo for posters
--      poster_background → illustrated background for photo-less items
-- 2) public.poster_art — per (restaurant, menu item, kind) cache, so artwork
--    is generated once and reused by every later poster. `source_image_url`
--    records the photo a cut-out was made from; a new photo makes it stale.
--    Files live in the private `posters` bucket under {restaurant_id}/art/.
--
-- Tenant-scoped read-only for members; ALL writes go through the service role.

alter table public.ai_image_generations
  add column if not exists purpose text not null default 'menu_photo';

alter table public.ai_image_generations
  drop constraint if exists ai_image_generations_purpose_known;
alter table public.ai_image_generations
  add constraint ai_image_generations_purpose_known
  check (purpose in ('menu_photo', 'poster_cutout', 'poster_background'));

create index if not exists idx_ai_image_generations_restaurant_purpose_created
  on public.ai_image_generations (restaurant_id, purpose, created_at desc);

create table if not exists public.poster_art (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references public.restaurants(id) on delete cascade,
  menu_item_id     uuid not null references public.menu_items(id) on delete cascade,
  kind             text not null check (kind in ('cutout', 'background')),
  status           text not null default 'preparing'
    check (status in ('preparing', 'ready', 'failed')),
  source_image_url text,
  storage_path     text,
  error            text check (error is null or char_length(error) <= 500),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint poster_art_item_kind_key unique (restaurant_id, menu_item_id, kind),
  constraint poster_art_ready_has_file
    check (status <> 'ready' or storage_path is not null)
);

alter table public.poster_art enable row level security;

drop policy if exists poster_art_member_read on public.poster_art;
create policy poster_art_member_read
  on public.poster_art
  for select
  to authenticated
  using (public.is_restaurant_member(restaurant_id));

-- ── self-verification ───────────────────────────────────────────────────────

do $verify_poster_ai_art$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'poster_art' and c.relrowsecurity
  ) then
    raise exception 'poster_art must have row level security enabled';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('poster_art', 'ai_image_generations')
      and cmd <> 'SELECT'
  ) then
    raise exception 'poster_art / ai_image_generations must not have write policies (service-role writes only)';
  end if;

  if exists (
    select 1 from storage.buckets where id = 'posters' and public = true
  ) then
    raise exception 'posters bucket must stay private';
  end if;
end;
$verify_poster_ai_art$;

notify pgrst, 'reload schema';
