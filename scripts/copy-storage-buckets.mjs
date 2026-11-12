// Copy Supabase Storage files from one project to another (Sydney -> Mumbai
// migration, cutover step 4). Operator tool; never run from the app.
//
//   SOURCE_SUPABASE_URL=https://<old>.supabase.co SOURCE_SERVICE_ROLE_KEY=... \
//   TARGET_SUPABASE_URL=https://<new>.supabase.co TARGET_SERVICE_ROLE_KEY=... \
//   node scripts/copy-storage-buckets.mjs [plan|copy|verify] [--bucket name]... \
//     [--state file] [--concurrency n]
//
// plan    (default) list what would be copied; changes nothing.
// copy    create missing buckets with the source's settings, then upload every
//         file at the same path with the same content type, overwriting.
//         Overwrite is required: the database dump already restored the
//         storage.objects rows, so the target LISTS every file whose bytes are
//         not there yet. For the same reason resume is tracked in a local state
//         file (one copied "bucket/path" per line), never by listing the target.
// verify  download each file from both projects and compare SHA-256; exits 1 on
//         any missing or different file.

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const DEFAULT_BUCKETS = [
  "menu-images",
  "restaurant-assets",
  "finance-documents",
  "posters",
  "whatsapp-media"
];

const PAGE_SIZE = 1000;

/** Every file path in a bucket, depth-first. Folders have no id in list(). */
export async function listAllFiles(client, bucket, prefix = "") {
  const files = [];
  // Page until an empty page, advancing by what came back: a server that caps
  // pages below PAGE_SIZE must not end the listing early.
  for (let offset = 0; ; ) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" }
    });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null || entry.id === undefined) {
        files.push(...(await listAllFiles(client, bucket, path)));
      } else {
        files.push({ path, size: entry.metadata?.size ?? null, contentType: entry.metadata?.mimetype ?? null });
      }
    }
    if (!data?.length) return files;
    offset += data.length;
  }
}

async function ensureBucket(source, target, bucket) {
  const { data: wanted, error } = await source.storage.getBucket(bucket);
  if (error || !wanted) throw new Error(`source bucket ${bucket} not found`);
  const settings = {
    public: wanted.public,
    fileSizeLimit: wanted.file_size_limit ?? undefined,
    allowedMimeTypes: wanted.allowed_mime_types ?? undefined
  };
  const { data: existing } = await target.storage.getBucket(bucket);
  const result = existing
    ? await target.storage.updateBucket(bucket, settings)
    : await target.storage.createBucket(bucket, settings);
  if (result.error) throw new Error(`prepare target bucket ${bucket}: ${result.error.message}`);
}

async function download(client, bucket, path) {
  const { data, error } = await client.storage.from(bucket).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function pool(items, concurrency, work) {
  let next = 0;
  const run = async () => {
    while (next < items.length) await work(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}

function readState(statePath) {
  if (!statePath || !existsSync(statePath)) return new Set();
  return new Set(readFileSync(statePath, "utf8").split("\n").filter(Boolean));
}

/**
 * Returns { buckets: {name: {files, copied, skipped, failed, mismatched}}, ok }.
 * `log` receives one line per event; keys are never logged.
 */
export async function runStorageCopy({
  source,
  target,
  mode = "plan",
  buckets = DEFAULT_BUCKETS,
  statePath = null,
  concurrency = 4,
  log = console.log
}) {
  if (!["plan", "copy", "verify"].includes(mode)) throw new Error(`unknown mode ${mode}`);
  const done = readState(statePath);
  const report = { buckets: {}, ok: true };

  for (const bucket of buckets) {
    const stats = { files: 0, copied: 0, skipped: 0, failed: 0, mismatched: 0 };
    report.buckets[bucket] = stats;
    const files = await listAllFiles(source, bucket);
    stats.files = files.length;
    log(`${bucket}: ${files.length} file(s) in source`);
    if (mode === "plan") continue;
    if (mode === "copy") await ensureBucket(source, target, bucket);

    await pool(files, concurrency, async (file) => {
      const key = `${bucket}/${file.path}`;
      if (mode === "copy" && done.has(key)) {
        stats.skipped += 1;
        return;
      }
      const bytes = await download(source, bucket, file.path);
      if (!bytes) {
        stats.failed += 1;
        log(`FAILED download ${key}`);
        return;
      }
      if (mode === "verify") {
        const copy = await download(target, bucket, file.path);
        if (!copy || sha256(copy) !== sha256(bytes)) {
          stats.mismatched += 1;
          log(`${copy ? "DIFFERENT" : "MISSING"} ${key}`);
        }
        return;
      }
      const { error } = await target.storage.from(bucket).upload(file.path, bytes, {
        contentType: file.contentType ?? "application/octet-stream",
        upsert: true
      });
      if (error) {
        stats.failed += 1;
        log(`FAILED upload ${key}: ${error.message}`);
        return;
      }
      stats.copied += 1;
      if (statePath) appendFileSync(statePath, `${key}\n`);
    });

    if (stats.failed || stats.mismatched) report.ok = false;
    log(`${bucket}: ${JSON.stringify(stats)}`);
  }
  return report;
}

function parseArgs(argv) {
  const options = { mode: "plan", buckets: [], statePath: "storage-copy-state.txt", concurrency: 4 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--bucket") options.buckets.push(argv[++i]);
    else if (arg === "--state") options.statePath = argv[++i];
    else if (arg === "--concurrency") options.concurrency = Number(argv[++i]);
    else if (!arg.startsWith("--")) options.mode = arg;
    else throw new Error(`unknown option ${arg}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 16) {
    throw new Error("--concurrency must be 1-16");
  }
  if (options.buckets.length === 0) options.buckets = DEFAULT_BUCKETS;
  return options;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}`);
  return value;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceUrl = requiredEnv("SOURCE_SUPABASE_URL");
  const targetUrl = requiredEnv("TARGET_SUPABASE_URL");
  if (new URL(sourceUrl).host === new URL(targetUrl).host) {
    throw new Error("SOURCE_SUPABASE_URL and TARGET_SUPABASE_URL are the same project");
  }
  const { createClient } = await import("@supabase/supabase-js");
  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
  const report = await runStorageCopy({
    ...options,
    source: createClient(sourceUrl, requiredEnv("SOURCE_SERVICE_ROLE_KEY"), clientOptions),
    target: createClient(targetUrl, requiredEnv("TARGET_SERVICE_ROLE_KEY"), clientOptions)
  });
  console.log(report.ok ? "OK" : "PROBLEMS FOUND (see lines above)");
  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
