// Data checks for the Sydney -> Mumbai move (migration plan: Verification,
// "Data checks", cutover step 5). Read-only on both databases.
//
//   OLD_DB_URL=postgresql://...sydney... NEW_DB_URL=postgresql://...mumbai... \
//   node scripts/rehearsal-checks.mjs --old-ref <old 20-char project ref> [--mode rehearsal|cutover]
//
// Compares the two databases and prints PASS / WARN / FAIL per check; exits 1
// on any FAIL. Uses psql (needed for the dump/restore anyway).
//
// --mode rehearsal (default)  the old project keeps taking orders after the
//                             dump, so "new has fewer rows than old" is a WARN.
// --mode cutover              writes are frozen (maintenance on), so every
//                             count must match exactly.
//
// File BYTES are checked by `node scripts/copy-storage-buckets.mjs verify`;
// this script compares storage.objects rows per bucket only.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const REQUIRED_REALTIME_TABLES = ["orders", "whatsapp_messages"];
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
export function compareSnapshots(oldSnap, newSnap, { mode = "rehearsal" } = {}) {
  if (!["rehearsal", "cutover"].includes(mode)) throw new Error(`unknown mode ${mode}`);
  const results = [
    compareCounts("Row counts (public, auth.users/identities, storage)", oldSnap.rows, newSnap.rows, mode),
    compareCounts("Storage file records per bucket", oldSnap.storage_objects, newSnap.storage_objects, mode),
    compareCounts("Sequence positions", oldSnap.sequences, newSnap.sequences, mode),
    compareSets("Realtime publication", oldSnap.realtime, newSnap.realtime),
    compareSets("Extensions", oldSnap.extensions, newSnap.extensions),
    compareSets("RLS-enabled tables", oldSnap.rls_tables, newSnap.rls_tables),
    compareSets("RLS policies", oldSnap.policies, newSnap.policies),
    compareSets("Public functions", oldSnap.functions, newSnap.functions)
  ];

  const missingRealtime = REQUIRED_REALTIME_TABLES.filter((t) => !newSnap.realtime.includes(t));
  results.push(missingRealtime.length
    ? { check: "Live updates (orders, chat)", status: "FAIL", detail: `not published: ${missingRealtime.join(", ")}` }
    : { check: "Live updates (orders, chat)", status: "PASS", detail: REQUIRED_REALTIME_TABLES.join(", ") });

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
  const options = { mode: "rehearsal", oldRef: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--mode") options.mode = argv[++i];
    else if (argv[i] === "--old-ref") options.oldRef = argv[++i];
    else throw new Error(`unknown option ${argv[i]}`);
  }
  if (!/^[a-z0-9]{20}$/.test(options.oldRef ?? "")) throw new Error("--old-ref must be the old 20-character project ref");
  if (!["rehearsal", "cutover"].includes(options.mode)) throw new Error("--mode must be rehearsal or cutover");
  return options;
}

function main() {
  const { mode, oldRef } = parseArgs(process.argv.slice(2));
  const oldUrl = process.env.OLD_DB_URL;
  const newUrl = process.env.NEW_DB_URL;
  if (!oldUrl || !newUrl) throw new Error("Set OLD_DB_URL and NEW_DB_URL");
  if (oldUrl === newUrl) throw new Error("OLD_DB_URL and NEW_DB_URL are the same database");
  const results = compareSnapshots(takeSnapshot(oldUrl, oldRef), takeSnapshot(newUrl, oldRef), { mode });
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
