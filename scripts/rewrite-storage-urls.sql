-- Rewrite stored Supabase Storage URLs after moving to a new project
-- (Sydney -> Mumbai migration, cutover step 4). Operator tool, not a migration.
--
-- Public file links are stored in full, e.g. menu_items.image_url =
--   https://<old_ref>.supabase.co/storage/v1/object/public/menu-images/...
-- Every text, varchar, text[] and jsonb column in the public schema is searched
-- (not a hand-kept list), and only the storage prefix
--   https://<old_ref>.supabase.co/storage/v1/
-- is replaced, so any other text that merely mentions the project is left alone.
--
-- Run against the NEW project, after the restore and the file copy:
--   psql "$NEW_DB_URL" -v old_ref=<old 20-char ref> -v new_ref=<new ref> \
--     -f scripts/rewrite-storage-urls.sql                # dry run: report, roll back
--   psql "$NEW_DB_URL" -v old_ref=... -v new_ref=... -v apply=true \
--     -f scripts/rewrite-storage-urls.sql                # rewrite and commit
--
-- Triggers are disabled for the rewrite (session_replication_role = replica):
-- updated_at stamps, order stage clocks and finance audit rows must not change
-- or fire because a link moved hosts. The whole run is one transaction and
-- aborts if any old link survives.

\set ON_ERROR_STOP on
\if :{?old_ref}
\else
  do $missing$ begin raise exception 'Set -v old_ref=<old project ref>'; end $missing$;
\endif
\if :{?new_ref}
\else
  do $missing$ begin raise exception 'Set -v new_ref=<new project ref>'; end $missing$;
\endif
\if :{?apply}
\else
  \set apply false
\endif
-- nested=true (tests only): run inside the caller's transaction as a savepoint.
\if :{?nested}
\else
  \set nested false
\endif

\if :nested
  savepoint rewrite_storage_urls;
\else
  begin;
\endif
select set_config('whatsorder.old_ref', :'old_ref', true),
       set_config('whatsorder.new_ref', :'new_ref', true);
set local session_replication_role = replica;

do $rewrite_storage_urls$
declare
  old_ref text := current_setting('whatsorder.old_ref');
  new_ref text := current_setting('whatsorder.new_ref');
  old_prefix text;
  new_prefix text;
  col record;
  pattern text;
  changed bigint;
  total bigint := 0;
  remaining bigint := 0;
begin
  if old_ref !~ '^[a-z0-9]{20}$' or new_ref !~ '^[a-z0-9]{20}$' then
    raise exception 'old_ref and new_ref must be 20-character Supabase project refs';
  end if;
  if old_ref = new_ref then
    raise exception 'old_ref and new_ref are the same project';
  end if;
  old_prefix := 'https://' || old_ref || '.supabase.co/storage/v1/';
  new_prefix := 'https://' || new_ref || '.supabase.co/storage/v1/';
  -- LIKE pattern with no wildcards in the prefix itself (refs are [a-z0-9]).
  pattern := '%' || old_prefix || '%';

  for col in
    select c.table_name, c.column_name, c.data_type, c.udt_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and c.is_generated = 'NEVER'
      and (c.data_type in ('text', 'character varying', 'jsonb')
           or (c.data_type = 'ARRAY' and c.udt_name in ('_text', '_varchar')))
    order by c.table_name, c.column_name
  loop
    if col.data_type = 'jsonb' then
      execute format(
        'update public.%I set %I = replace(%I::text, $1, $2)::jsonb where %I::text like $3',
        col.table_name, col.column_name, col.column_name, col.column_name
      ) using old_prefix, new_prefix, pattern;
    elsif col.data_type = 'ARRAY' then
      execute format(
        'update public.%I set %I = (select array_agg(replace(v, $1, $2) order by n)
           from unnest(%I) with ordinality as u(v, n))
         where array_to_string(%I, chr(31)) like $3',
        col.table_name, col.column_name, col.column_name, col.column_name
      ) using old_prefix, new_prefix, pattern;
    else
      execute format(
        'update public.%I set %I = replace(%I, $1, $2) where %I like $3',
        col.table_name, col.column_name, col.column_name, col.column_name
      ) using old_prefix, new_prefix, pattern;
    end if;
    get diagnostics changed = row_count;
    if changed > 0 then
      raise notice 'rewrote % row(s) in %.%', changed, col.table_name, col.column_name;
      total := total + changed;
    end if;
  end loop;

  -- Nothing may still point at the old project's storage, in any column.
  for col in
    select c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
      and (c.data_type in ('text', 'character varying', 'jsonb')
           or (c.data_type = 'ARRAY' and c.udt_name in ('_text', '_varchar')))
  loop
    execute format(
      case when col.data_type = 'ARRAY'
        then 'select count(*) from public.%I where array_to_string(%I, chr(31)) like $1'
        else 'select count(*) from public.%I where %I::text like $1' end,
      col.table_name, col.column_name
    ) into changed using pattern;
    remaining := remaining + changed;
  end loop;
  if remaining > 0 then
    raise exception 'Still % row(s) linking to the old project storage; nothing committed', remaining;
  end if;
  raise notice 'total rows rewritten: %; links left to the old project: 0', total;
end;
$rewrite_storage_urls$;

\if :apply
  \if :nested
    release savepoint rewrite_storage_urls;
    set local session_replication_role = origin;
  \else
    commit;
  \endif
  \echo 'Applied: storage URLs now point at the new project.'
\else
  \if :nested
    rollback to savepoint rewrite_storage_urls;
  \else
    rollback;
  \endif
  \echo 'Dry run: nothing changed. Re-run with -v apply=true to commit.'
\endif
