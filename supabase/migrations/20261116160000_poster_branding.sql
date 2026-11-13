-- WhatsOrder: per-restaurant poster branding (Marketing Phase 5).
--
-- restaurants.poster_brand_color — optional brand colour (#rrggbb, lower
--   case). NULL → the poster palette is derived from the logo, falling back
--   to the default food palette. The full palette (background, text, accent)
--   is built in code with a 4.5:1 contrast check (lib/poster/palette.ts).
-- restaurants.poster_theme — optional default poster look. NULL → the
--   default theme (street_food).
--
-- Columns only: restaurants keeps its existing RLS posture (member read,
-- service-role writes via the settings server action).

alter table public.restaurants
  add column if not exists poster_brand_color text,
  add column if not exists poster_theme text;

alter table public.restaurants
  drop constraint if exists restaurants_poster_brand_color_format;
alter table public.restaurants
  add constraint restaurants_poster_brand_color_format
  check (poster_brand_color is null or poster_brand_color ~ '^#[0-9a-f]{6}$');

alter table public.restaurants
  drop constraint if exists restaurants_poster_theme_known;
alter table public.restaurants
  add constraint restaurants_poster_theme_known
  check (
    poster_theme is null
    or poster_theme in ('street_food', 'bold_deal', 'minimal_cafe', 'dark_premium')
  );

-- ── self-verification ───────────────────────────────────────────────────────

do $verify_poster_branding$
begin
  if (
    select count(*) from information_schema.columns
    where table_schema = 'public'
      and table_name = 'restaurants'
      and column_name in ('poster_brand_color', 'poster_theme')
      and is_nullable = 'YES'
  ) <> 2 then
    raise exception 'restaurants.poster_brand_color / poster_theme must exist and be nullable';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'restaurants' and c.relrowsecurity
  ) then
    raise exception 'restaurants must keep row level security enabled';
  end if;

  -- Same invariant as the P0-3 least-privilege migration.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'restaurants'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'restaurants must not have write policies (service-role writes only)';
  end if;
end;
$verify_poster_branding$;

notify pgrst, 'reload schema';
