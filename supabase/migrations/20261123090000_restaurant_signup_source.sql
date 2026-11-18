-- WhatsOrder: restaurant signup source (growth measurement).
--
-- restaurants.signup_source — nullable token from the /try link's `?src=`
-- (e.g. home, field-karama, ref-chaixpress). Written once, by the service-role
-- demo build action right after the demo restaurant row is inserted, scoped by
-- id + is_demo and only while still null. The claim RPC updates the same row,
-- so the source survives a claim. Same token format as orders.attribution_source.
--
-- No RLS policy changes: restaurants keep their existing posture and the
-- column is written by service role only. No customer data is involved.

alter table public.restaurants
  add column if not exists signup_source text;

alter table public.restaurants
  drop constraint if exists restaurants_signup_source_format;
alter table public.restaurants
  add constraint restaurants_signup_source_format
  check (
    signup_source is null
    or signup_source ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  );

-- ── self-verification ───────────────────────────────────────────────────────

do $verify_signup_source$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'restaurants'
      and column_name = 'signup_source'
      and is_nullable = 'YES'
  ) then
    raise exception 'restaurants.signup_source must exist and be nullable';
  end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'restaurants' and c.relrowsecurity
  ) then
    raise exception 'restaurants must keep row level security enabled';
  end if;
end;
$verify_signup_source$;

notify pgrst, 'reload schema';
