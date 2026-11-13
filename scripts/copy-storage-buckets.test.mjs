import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultStatePath, listAllFiles, runStorageCopy } from "./copy-storage-buckets.mjs";

// In-memory stand-in for the parts of supabase-js storage the script uses.
// `rowsOnly` paths are listed (storage.objects row restored by the DB dump)
// but have no bytes, exactly like the target right after the restore.
function fakeProject({ buckets = {}, files = {}, rowsOnly = [], pageSize = 1000 } = {}) {
  const store = new Map(Object.entries(files).map(([key, value]) => [key, { ...value }]));
  for (const key of rowsOnly) store.set(key, { bytes: null, type: "image/webp" });
  const bucketSettings = new Map(Object.entries(buckets));
  const uploads = [];
  const listCalls = [];

  const entriesUnder = (bucket, prefix) => {
    const base = prefix ? `${bucket}/${prefix}/` : `${bucket}/`;
    const names = new Map();
    for (const key of store.keys()) {
      if (!key.startsWith(base)) continue;
      const [head, ...rest] = key.slice(base.length).split("/");
      if (rest.length) names.set(head, { name: head, id: null });
      else names.set(head, { name: head, id: `id-${key}`, metadata: { size: store.get(key).bytes?.length ?? 0, mimetype: store.get(key).type } });
    }
    return [...names.values()].sort((a, b) => a.name.localeCompare(b.name));
  };

  return {
    uploads,
    listCalls,
    store,
    bucketSettings,
    storage: {
      getBucket: async (id) => (bucketSettings.has(id)
        ? { data: { id, ...bucketSettings.get(id) }, error: null }
        : { data: null, error: { message: "not found" } }),
      createBucket: async (id, s) => {
        bucketSettings.set(id, { public: s.public, file_size_limit: s.fileSizeLimit, allowed_mime_types: s.allowedMimeTypes });
        return { data: { name: id }, error: null };
      },
      updateBucket: async (id, s) => {
        bucketSettings.set(id, { public: s.public, file_size_limit: s.fileSizeLimit, allowed_mime_types: s.allowedMimeTypes });
        return { data: {}, error: null };
      },
      from: (bucket) => ({
        list: async (prefix, { limit, offset }) => {
          listCalls.push({ bucket, prefix, offset });
          return { data: entriesUnder(bucket, prefix).slice(offset, offset + Math.min(limit, pageSize)), error: null };
        },
        download: async (path) => {
          const file = store.get(`${bucket}/${path}`);
          if (!file?.bytes) return { data: null, error: { message: "Object not found" } };
          return { data: new Blob([file.bytes]), error: null };
        },
        upload: async (path, bytes, options) => {
          uploads.push({ key: `${bucket}/${path}`, ...options });
          if (!options.upsert && store.has(`${bucket}/${path}`)) return { data: null, error: { message: "The resource already exists" } };
          store.set(`${bucket}/${path}`, { bytes: Buffer.from(bytes), type: options.contentType });
          return { data: { path }, error: null };
        }
      })
    }
  };
}

const bytes = (text) => Buffer.from(text);
const sourceFiles = {
  "menu-images/r1/tea.webp": { bytes: bytes("tea"), type: "image/webp" },
  "menu-images/r1/deep/cake.png": { bytes: bytes("cake"), type: "image/png" },
  "finance-documents/r1/bill.pdf": { bytes: bytes("%PDF-bill"), type: "application/pdf" }
};
const sourceBuckets = {
  "menu-images": { public: true, file_size_limit: 2097152, allowed_mime_types: ["image/webp", "image/png"] },
  "finance-documents": { public: false, file_size_limit: 10485760, allowed_mime_types: ["application/pdf"] }
};
const buckets = ["menu-images", "finance-documents"];
const quiet = () => {};

describe("storage bucket copy script", () => {
  it("lists nested folders and follows pagination", async () => {
    const many = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`menu-images/r1/f${i}.webp`, { bytes: bytes(`${i}`), type: "image/webp" }]));
    const source = fakeProject({ files: { ...many, ...sourceFiles }, pageSize: 2 });
    const files = await listAllFiles(source, "menu-images");
    expect(files.map((f) => f.path).sort()).toEqual([
      "r1/deep/cake.png", "r1/f0.webp", "r1/f1.webp", "r1/f2.webp", "r1/f3.webp", "r1/f4.webp", "r1/tea.webp"
    ]);
    expect(source.listCalls.some((call) => call.offset > 0)).toBe(true);
  });

  it("plan mode reads only and changes nothing", async () => {
    const source = fakeProject({ buckets: sourceBuckets, files: sourceFiles });
    const target = fakeProject();
    const report = await runStorageCopy({ source, target, buckets, log: quiet });
    expect(report.buckets["menu-images"].files).toBe(2);
    expect(target.uploads).toHaveLength(0);
    expect(target.bucketSettings.size).toBe(0);
  });

  it("copies bytes over restored rows, keeps content types and mirrors bucket settings", async () => {
    const source = fakeProject({ buckets: sourceBuckets, files: sourceFiles });
    const target = fakeProject({ rowsOnly: Object.keys(sourceFiles) });
    const report = await runStorageCopy({ source, target, mode: "copy", buckets, log: quiet });
    expect(report.ok).toBe(true);
    expect(target.uploads.every((u) => u.upsert === true)).toBe(true);
    for (const [key, file] of Object.entries(sourceFiles)) {
      expect(target.store.get(key).bytes.equals(file.bytes), key).toBe(true);
      expect(target.store.get(key).type).toBe(file.type);
    }
    expect(target.bucketSettings.get("finance-documents")).toEqual(sourceBuckets["finance-documents"]);
    expect((await runStorageCopy({ source, target, mode: "verify", buckets, log: quiet })).ok).toBe(true);
  });

  it("verify catches files that are only restored rows, and different bytes", async () => {
    const source = fakeProject({ buckets: sourceBuckets, files: sourceFiles });
    const target = fakeProject({
      rowsOnly: ["menu-images/r1/tea.webp"],
      files: {
        "menu-images/r1/deep/cake.png": { bytes: bytes("stale"), type: "image/png" },
        "finance-documents/r1/bill.pdf": sourceFiles["finance-documents/r1/bill.pdf"]
      }
    });
    const lines = [];
    const report = await runStorageCopy({ source, target, mode: "verify", buckets, log: (l) => lines.push(l) });
    expect(report.ok).toBe(false);
    expect(report.buckets["menu-images"].mismatched).toBe(2);
    expect(lines).toContain("MISSING menu-images/r1/tea.webp");
    expect(lines).toContain("DIFFERENT menu-images/r1/deep/cake.png");
  });

  it("resumes from the state file instead of trusting the target listing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "storage-copy-"));
    const statePath = join(dir, "state.txt");
    writeFileSync(statePath, "# target: mumbai\nmenu-images/r1/tea.webp\n");
    const source = fakeProject({ buckets: sourceBuckets, files: sourceFiles });
    const target = fakeProject({ files: { "menu-images/r1/tea.webp": sourceFiles["menu-images/r1/tea.webp"] } });
    const report = await runStorageCopy({ source, target, mode: "copy", buckets, statePath, targetId: "mumbai", log: quiet });
    expect(report.buckets["menu-images"]).toMatchObject({ files: 2, copied: 1, skipped: 1 });
    expect(target.uploads.map((u) => u.key)).not.toContain("menu-images/r1/tea.webp");
    const [header, ...keys] = readFileSync(statePath, "utf8").trim().split("\n");
    expect(header).toBe("# target: mumbai");
    expect(keys.sort()).toEqual([
      "finance-documents/r1/bill.pdf", "menu-images/r1/deep/cake.png", "menu-images/r1/tea.webp"
    ]);
  });

  it("refuses a state file left over from another target (rehearsal -> production)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "storage-copy-"));
    const statePath = join(dir, "state.txt");
    const source = fakeProject({ buckets: sourceBuckets, files: sourceFiles });
    await runStorageCopy({ source, target: fakeProject(), mode: "copy", buckets, statePath, targetId: "rehearsal", log: quiet });

    const production = fakeProject();
    await expect(
      runStorageCopy({ source, target: production, mode: "copy", buckets, statePath, targetId: "production", log: quiet })
    ).rejects.toThrow(/written for target rehearsal, not production/);
    expect(production.uploads).toEqual([]);
  });

  it("refuses a legacy state file with no target header", async () => {
    const dir = mkdtempSync(join(tmpdir(), "storage-copy-"));
    const statePath = join(dir, "state.txt");
    writeFileSync(statePath, "menu-images/r1/tea.webp\n");
    const source = fakeProject({ buckets: sourceBuckets, files: sourceFiles });
    await expect(
      runStorageCopy({ source, target: fakeProject(), mode: "copy", buckets, statePath, targetId: "production", log: quiet })
    ).rejects.toThrow(/unknown target/);
  });

  it("names the default state file after the target project", () => {
    expect(defaultStatePath("https://abcdmumbai.supabase.co")).toBe("storage-copy-state-abcdmumbai.txt");
  });

  it("reports a failed source download without stopping the run", async () => {
    const source = fakeProject({ buckets: sourceBuckets, files: sourceFiles, rowsOnly: ["menu-images/r1/broken.webp"] });
    const target = fakeProject();
    const report = await runStorageCopy({ source, target, mode: "copy", buckets, log: quiet });
    expect(report.ok).toBe(false);
    expect(report.buckets["menu-images"]).toMatchObject({ files: 3, copied: 2, failed: 1 });
    expect(report.buckets["finance-documents"].copied).toBe(1);
  });
});
