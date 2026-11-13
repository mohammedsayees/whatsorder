// Data checks for the Sydney -> Mumbai move (migration plan: Verification,
// "Data checks", cutover step 5). Read-only on both databases.
//
//   OLD_DB_URL=postgresql://...sydney... NEW_DB_URL=postgresql://...mumbai... \
//   node scripts/rehearsal-checks.mjs --old-ref <old 20-char project ref> [--mode rehearsal|cutover]
//   node scripts/rehearsal-checks.mjs --old-ref <ref> --mode post-move --since <switch time, ISO 8601>
//
// Compares the two databases and prints PASS / WARN / FAIL per check; exits 1
// on any FAIL. Uses psql (needed for the dump/restore anyway).
//
// --mode rehearsal (default)  the old project keeps taking orders after the
//                             dump, so "new has fewer rows than old" is a WARN.
// --mode cutover              writes are frozen (maintenance on), so every
//                             count must match exactly.
// --mode post-move            the new project is live and has moved on. Row
//                             counts are not compared; instead every old-DB
//                             table written (created_at / updated_at) after
//                             --since FAILs: those writes never reached the
//                             new project. Schema / permission differences
//                             are WARN (migrations may have run since).
//
// Permissions are compared exactly: table, view and sequence grants and
// function EXECUTE for anon / authenticated / service_role / PUBLIC, plus the
// default privileges new objects get ("Automatically expose new tables").
//
// Schema objects are compared by DEFINITION, not just name: policies (command,
// roles, USING / WITH CHECK), public functions (full body, SECURITY DEFINER,
// search_path), triggers on public and auth tables (incl. enabled state),
// public indexes and constraints (incl. validated state), and storage bucket
// settings (public flag, size limit, MIME types), plus per-role settings of
// the API roles (statement_timeout etc.; pg_dump does not carry them). The
// cutover write freeze (scripts/freeze-old-project.sql) is ignored. Definitions are hashed to
// keep output short; a FAIL names each changed object.
//
// File BYTES are checked by `node scripts/copy-storage-buckets.mjs verify`;
// this script compares storage.objects rows per bucket only. Project settings
// outside the database (Auth URLs, API max rows, SMTP, ...) are NOT covered:
// see docs/MUMBAI_CUTOVER.md.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const MODES = ["rehearsal", "cutover", "post-move"];
const REQUIRED_REALTIME_TABLES = ["orders", "whatsapp_messages"];
// Added to the OLD project by scripts/freeze-old-project.sql at cutover.
const FREEZE_TRIGGER = "zz_cutover_freeze";
const isFreezeTrigger = (key) => key.endsWith(`:${FREEZE_TRIGGER}`);
const withoutFreeze = (defs = {}) =>
  Object.fromEntries(Object.entries(defs).filter(([key]) => !isFreezeTrigger(key)));
const MAX_LISTED = 10;

// Text-like columns that can hold a stored storage URL (same set the rewrite
// script scans).
const LINK_COLUMNS_SQL = `
  select c.table_name, c.column_name, c.data_type
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
    and (c.data_type in ('text', 'character varying', 'jsonb')
         or (c.data_type = 'ARRAY' and c.udt_name in ('_text', '_varchar')))`;

const countOf = (sql) =>
  `(xpath('/row/c/text()', query_to_xml(${sql}, false, true, '')))[1]::text::bigint`;

/** One statement returning the whole snapshot as JSON. :'old_prefix' is a psql variable. */
export const SNAPSHOT_SQL = `
select json_build_object(
  'rows', (
    select coalesce(json_object_agg(t.table_schema || '.' || t.table_name,
      ${countOf("format('select count(*) as c from %I.%I', t.table_schema, t.table_name)")}), '{}')
    from information_schema.tables t
    where t.table_type = 'BASE TABLE'
      and (t.table_schema = 'public'
           or (t.table_schema = 'auth' and t.table_name in ('users', 'identities'))
           or (t.table_schema = 'storage' and t.table_name in ('buckets', 'objects')))
  ),
  'storage_objects', (
    select coalesce(json_object_agg(bucket_id, n), '{}')
    from (select bucket_id, count(*) as n from storage.objects group by bucket_id) b
  ),
  'realtime', (
    select coalesce(json_agg(tablename order by tablename), '[]')
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
  ),
  'extensions', (select coalesce(json_agg(extname order by extname), '[]') from pg_extension),
  'policies', (
    select coalesce(json_agg(schemaname || '.' || tablename || ':' || policyname order by 1), '[]')
    from pg_policies where schemaname in ('public', 'storage')
  ),
  'rls_tables', (
    select coalesce(json_agg(c.relname order by c.relname), '[]')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  ),
  'functions', (
    select coalesce(json_agg(p.oid::regprocedure::text order by 1), '[]')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),
  'table_grants', (
    select coalesce(json_agg(entry order by entry), '[]') from (
      select c.relname || ':' || case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end
             || ':' || a.privilege_type as entry
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl, acldefault((case when c.relkind = 'S' then 's' else 'r' end)::"char", c.relowner))) a
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'S')
        and (a.grantee = 0 or a.grantee::regrole::text in ('anon', 'authenticated', 'service_role'))
    ) g
  ),
  'function_grants', (
    select coalesce(json_agg(entry order by entry), '[]') from (
      select p.oid::regprocedure::text || ':' || case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end as entry
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
      where n.nspname = 'public' and a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or a.grantee::regrole::text in ('anon', 'authenticated', 'service_role'))
    ) g
  ),
  'default_privileges', (
    select coalesce(json_agg(entry order by entry), '[]') from (
      select d.defaclrole::regrole::text || ':' || d.defaclobjtype::text || ':'
             || case a.grantee when 0 then 'PUBLIC' else a.grantee::regrole::text end || ':' || a.privilege_type as entry
      from pg_default_acl d
      left join pg_namespace n on n.oid = d.defaclnamespace
      cross join lateral aclexplode(d.defaclacl) a
      where (n.nspname = 'public' or d.defaclnamespace = 0)
        and (a.grantee = 0 or a.grantee::regrole::text in ('anon', 'authenticated', 'service_role'))
    ) g
  ),
  'policy_definitions', (
    select coalesce(json_object_agg(schemaname || '.' || tablename || ':' || policyname,
      md5(concat_ws(' | ', cmd, permissive, roles::text, qual, with_check))), '{}')
    from pg_policies where schemaname in ('public', 'storage')
  ),
  'function_definitions', (
    select coalesce(json_object_agg(p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid))), '{}')
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
  ),
  'triggers', (
    select coalesce(json_object_agg(n.nspname || '.' || c.relname || ':' || t.tgname,
      md5(pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text)), '{}')
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname in ('public', 'auth')
  ),
  'indexes', (
    select coalesce(json_object_agg(tablename || ':' || indexname, md5(indexdef)), '{}')
    from pg_indexes where schemaname = 'public'
  ),
  'constraints', (
    select coalesce(json_object_agg(c.conrelid::regclass::text || ':' || c.conname,
      md5(pg_get_constraintdef(c.oid) || ' validated=' || c.convalidated::text)), '{}')
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace
    where n.nspname = 'public' and c.conrelid <> 0
  ),
  'buckets', (
    select coalesce(json_object_agg(id, concat_ws(' | ', 'public=' || public::text,
      'size_limit=' || coalesce(file_size_limit::text, 'none'),
      'mime=' || coalesce(array_to_string(allowed_mime_types, ','), 'any'))), '{}')
    from storage.buckets
  ),
  'role_settings', (
    select coalesce(json_agg(r.rolname || ':' || setting order by 1), '[]')
    from pg_roles r cross join lateral unnest(r.rolconfig) setting
    where r.rolname in ('anon', 'authenticated', 'service_role', 'authenticator',
                        'supabase_auth_admin', 'supabase_storage_admin')
      and setting not like 'default_transaction_read_only=%'
  ),
  'latest_writes', (
    select coalesce(json_object_agg(w.table_name, w.latest), '{}') from (
      select c.table_name,
        (xpath('/row/m/text()', query_to_xml(
          format('select greatest(%s) as m from public.%I', c.cols, c.table_name),
          false, true, '')))[1]::text as latest
      from (
        select col.table_name, string_agg(format('max(%I)', col.column_name), ', ') as cols
        from information_schema.columns col
        join information_schema.tables tab
          on tab.table_schema = col.table_schema and tab.table_name = col.table_name
        where col.table_schema = 'public' and tab.table_type = 'BASE TABLE'
          and col.column_name in ('created_at', 'updated_at')
          and col.data_type like 'timestamp%'
        group by col.table_name
      ) c
    ) w
    where w.latest is not null
  ),
  'sequences', (
    select coalesce(json_object_agg(sequencename, coalesce(last_value, 0)), '{}')
    from pg_sequences where schemaname = 'public'
  ),
  'old_links', (
    select coalesce(sum(${countOf(`format(
      case when l.data_type = 'ARRAY'
        then 'select count(*) as c from public.%I where array_to_string(%I, chr(31)) like %L'
        else 'select count(*) as c from public.%I where %I::text like %L' end,
      l.table_name, l.column_name, '%' || :'old_prefix' || '%')`)}), 0)
    from (${LINK_COLUMNS_SQL}) l
  )
)::text;`;

function listDiff(oldList, newList) {
  const oldSet = new Set(oldList);
  const newSet = new Set(newList);
  return {
    missing: oldList.filter((x) => !newSet.has(x)),
    extra: newList.filter((x) => !oldSet.has(x))
  };
}

function shortList(items) {
  const shown = items.slice(0, MAX_LISTED).join(", ");
  return items.length > MAX_LISTED ? `${shown} (+${items.length - MAX_LISTED} more)` : shown;
}

function compareCounts(name, oldCounts, newCounts, mode) {
  const fails = [];
  const warns = [];
  for (const [key, oldValue] of Object.entries(oldCounts)) {
    const before = Number(oldValue);
    if (!(key in newCounts)) {
      fails.push(`${key} missing`);
      continue;
    }
    const after = Number(newCounts[key]);
    if (after === before) continue;
    if (mode === "rehearsal" && after < before) warns.push(`${key} ${after}/${before}`);
    else fails.push(`${key} ${after} vs ${before}`);
  }
  for (const key of Object.keys(newCounts)) {
    if (!(key in oldCounts)) fails.push(`${key} only in new`);
  }
  if (fails.length) return { check: name, status: "FAIL", detail: shortList(fails) };
  if (warns.length) {
    return { check: name, status: "WARN", detail: `new < old (writes since the dump?): ${shortList(warns)}` };
  }
  return { check: name, status: "PASS", detail: `${Object.keys(oldCounts).length} compared` };
}

/** Same keys, same definition (or hash) per key. */
function compareDefinitions(name, oldDefs = {}, newDefs = {}) {
  const missing = [];
  const changed = [];
  for (const [key, value] of Object.entries(oldDefs)) {
    if (!(key in newDefs)) missing.push(key);
    else if (newDefs[key] !== value) changed.push(key);
  }
  const extra = Object.keys(newDefs).filter((key) => !(key in oldDefs));
  if (!missing.length && !changed.length && !extra.length) {
    return { check: name, status: "PASS", detail: `${Object.keys(oldDefs).length} match` };
  }
  const parts = [];
  if (missing.length) parts.push(`missing in new: ${shortList(missing)}`);
  if (changed.length) parts.push(`different: ${shortList(changed)}`);
  if (extra.length) parts.push(`only in new: ${shortList(extra)}`);
  return { check: name, status: "FAIL", detail: parts.join("; ") };
}

function compareSets(name, oldList, newList) {
  const { missing, extra } = listDiff(oldList, newList);
  if (!missing.length && !extra.length) {
    return { check: name, status: "PASS", detail: `${oldList.length} match` };
  }
  const parts = [];
  if (missing.length) parts.push(`missing in new: ${shortList(missing)}`);
  if (extra.length) parts.push(`only in new: ${shortList(extra)}`);
  return { check: name, status: "FAIL", detail: parts.join("; ") };
}

/** Pure comparison of two snapshots. Returns [{check, status, detail}]. */
export function compareSnapshots(oldSnap, newSnap, { mode = "rehearsal", since = null } = {}) {
  if (!MODES.includes(mode)) throw new Error(`unknown mode ${mode}`);
  const postMove = mode === "post-move";
  if (postMove && !Number.isFinite(Date.parse(since ?? ""))) {
    throw new Error("post-move mode needs --since <switch time, ISO 8601>");
  }
  const results = postMove ? [] : [
    compareCounts("Row counts (public, auth.users/identities, storage)", oldSnap.rows, newSnap.rows, mode),
    compareCounts("Storage file records per bucket", oldSnap.storage_objects, newSnap.storage_objects, mode),
    compareCounts("Sequence positions", oldSnap.sequences, newSnap.sequences, mode)
  ];
  const schemaStart = results.length;
  results.push(
    compareSets("Realtime publication", oldSnap.realtime, newSnap.realtime),
    compareSets("Extensions", oldSnap.extensions, newSnap.extensions),
    compareSets("RLS-enabled tables", oldSnap.rls_tables, newSnap.rls_tables),
    compareSets("RLS policies", oldSnap.policies, newSnap.policies),
    compareSets("Public functions", oldSnap.functions, newSnap.functions),
    compareDefinitions("RLS policy definitions", oldSnap.policy_definitions, newSnap.policy_definitions),
    compareDefinitions("Function definitions (body, security definer, search_path)", oldSnap.function_definitions, newSnap.function_definitions),
    compareDefinitions("Triggers (public, auth)", withoutFreeze(oldSnap.triggers), withoutFreeze(newSnap.triggers)),
    compareDefinitions("Indexes (public)", oldSnap.indexes, newSnap.indexes),
    compareDefinitions("Constraints (public)", oldSnap.constraints, newSnap.constraints),
    compareSets("API role settings (statement_timeout, ...)", oldSnap.role_settings ?? [], newSnap.role_settings ?? []),
    compareDefinitions("Storage bucket settings (public flag, size limit, MIME types)", oldSnap.buckets, newSnap.buckets),
    compareSets("Table permissions (anon, authenticated, service_role, PUBLIC)", oldSnap.table_grants, newSnap.table_grants),
    compareSets("Function execute permissions (API roles)", oldSnap.function_grants, newSnap.function_grants),
    compareSets("Default privileges for new objects", oldSnap.default_privileges, newSnap.default_privileges)
  );
  if (postMove) {
    for (const r of results.slice(schemaStart)) {
      if (r.status === "FAIL") {
        r.status = "WARN";
        r.detail = `${r.detail} (expected only if migrations ran on the new project after the move)`;
      }
    }
    const cutoff = Date.parse(since);
    const late = Object.entries(oldSnap.latest_writes ?? {})
      .filter(([, latest]) => Date.parse(latest) > cutoff)
      .sort(([, a], [, b]) => Date.parse(b) - Date.parse(a))
      .map(([table, latest]) => `${table} (last ${latest})`);
    results.unshift(late.length
      ? { check: "Writes to the old DB after the move", status: "FAIL", detail: `${late.length} table(s) written after ${since}, not in the new project: ${shortList(late)}` }
      : { check: "Writes to the old DB after the move", status: "PASS", detail: `none after ${since}` });
  }

  const missingRealtime = REQUIRED_REALTIME_TABLES.filter((t) => !newSnap.realtime.includes(t));
  results.push(missingRealtime.length
    ? { check: "Live updates (orders, chat)", status: "FAIL", detail: `not published: ${missingRealtime.join(", ")}` }
    : { check: "Live updates (orders, chat)", status: "PASS", detail: REQUIRED_REALTIME_TABLES.join(", ") });

  // A dump taken while frozen carries the freeze triggers: Mumbai would
  // reject every app write.
  const leftover = Object.keys(newSnap.triggers ?? {}).filter(isFreezeTrigger);
  results.push(leftover.length
    ? { check: "Cutover freeze removed from new DB", status: "FAIL", detail: `${leftover.length} table(s) still frozen; run scripts/freeze-old-project.sql -v action=unfreeze on the NEW database` }
    : { check: "Cutover freeze removed from new DB", status: "PASS", detail: "none" });

  const oldLinks = Number(newSnap.old_links);
  results.push(oldLinks === 0
    ? { check: "Old Sydney storage links in new DB", status: "PASS", detail: "0" }
    : { check: "Old Sydney storage links in new DB", status: "FAIL", detail: `${oldLinks} row(s); run scripts/rewrite-storage-urls.sql` });

  return results;
}

export function takeSnapshot(dbUrl, oldRef, run = execFileSync) {
  const output = run("psql", [
    dbUrl, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1",
    "-v", `old_prefix=https://${oldRef}.supabase.co/storage/v1/`,
    "-c", "set default_transaction_read_only = on;",
    "-f", "-"
  ], { input: SNAPSHOT_SQL, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(output.trim().split("\n").at(-1));
}

function parseArgs(argv) {
  const options = { mode: "rehearsal", oldRef: null, since: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--mode") options.mode = argv[++i];
    else if (argv[i] === "--old-ref") options.oldRef = argv[++i];
    else if (argv[i] === "--since") options.since = argv[++i];
    else throw new Error(`unknown option ${argv[i]}`);
  }
  if (!/^[a-z0-9]{20}$/.test(options.oldRef ?? "")) throw new Error("--old-ref must be the old 20-character project ref");
  if (!MODES.includes(options.mode)) throw new Error("--mode must be rehearsal, cutover or post-move");
  if (options.mode === "post-move" && !Number.isFinite(Date.parse(options.since ?? ""))) {
    throw new Error("--mode post-move needs --since <switch time, ISO 8601, e.g. 2026-11-10T22:00:00+04:00>");
  }
  return options;
}

function main() {
  const { mode, oldRef, since } = parseArgs(process.argv.slice(2));
  const oldUrl = process.env.OLD_DB_URL;
  const newUrl = process.env.NEW_DB_URL;
  if (!oldUrl || !newUrl) throw new Error("Set OLD_DB_URL and NEW_DB_URL");
  if (oldUrl === newUrl) throw new Error("OLD_DB_URL and NEW_DB_URL are the same database");
  const results = compareSnapshots(takeSnapshot(oldUrl, oldRef), takeSnapshot(newUrl, oldRef), { mode, since });
  for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.check}: ${r.detail}`);
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(failed ? `${failed} check(s) FAILED (${mode} mode)` : `All checks passed (${mode} mode)`);
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
