import { describe, expect, it } from "vitest";
import {
  IMMUTABLE_CACHE_SECONDS,
  applyConversions,
  planConversions,
  storagePathFromUrl,
  webpPathFor
} from "./convert-menu-images.mjs";

const SUPABASE = "https://proj.supabase.co";
const publicUrl = (path) => `${SUPABASE}/storage/v1/object/public/menu-images/${path}`;
const slugs = new Map([
  ["r1", "chaixpress"],
  ["r2", "other-cafe"]
]);

// In-memory stand-in for the parts of supabase-js the script uses.
function fakeClient({ files = {}, rows = [], uploadError = null, rowChangedMeanwhile = [] } = {}) {
  const store = new Map(Object.entries(files));
  const uploads = [];
  const updates = [];
  const storage = {
    download: async (path) =>
      store.has(path)
        ? { data: { arrayBuffer: async () => Uint8Array.from(store.get(path)).buffer }, error: null }
        : { data: null, error: { message: "Object not found" } },
    upload: async (path, bytes, options) => {
      uploads.push({ path, bytes, options });
      if (uploadError) return { error: uploadError };
      store.set(path, bytes);
      return { error: null };
    },
    getPublicUrl: (path) => ({ data: { publicUrl: publicUrl(path) } })
  };
  const client = {
    storage: { from: () => storage },
    from: () => {
      const filters = {};
      const query = {
        update: (values) => {
          filters.values = values;
          return query;
        },
        eq: (column, value) => {
          filters[column] = value;
          return query;
        },
        select: async () => {
          updates.push({ ...filters });
          const row = rows.find(
            (candidate) =>
              candidate.id === filters.id &&
              candidate.restaurant_id === filters.restaurant_id &&
              candidate.image_url === filters.image_url &&
              !rowChangedMeanwhile.includes(candidate.id)
          );
          if (row) row.image_url = filters.values.image_url;
          return { data: row ? [{ id: row.id }] : [], error: null };
        }
      };
      return query;
    }
  };
  return { client, uploads, updates, store };
}

describe("convert-menu-images planning", () => {
  it("reads storage paths only from this project's menu-images bucket", () => {
    expect(storagePathFromUrl(publicUrl("restaurants/chaixpress/tea-1.png"), SUPABASE)).toBe(
      "restaurants/chaixpress/tea-1.png"
    );
    expect(storagePathFromUrl("https://other.supabase.co/storage/v1/object/public/menu-images/a.png", SUPABASE)).toBeNull();
    expect(storagePathFromUrl(`${SUPABASE}/storage/v1/object/public/posters/a.png`, SUPABASE)).toBeNull();
    expect(storagePathFromUrl("https://cdn.example.com/a.png", SUPABASE)).toBeNull();
    expect(storagePathFromUrl("not a url", SUPABASE)).toBeNull();
    expect(storagePathFromUrl(null, SUPABASE)).toBeNull();
  });

  it("swaps the extension for the WebP copy", () => {
    expect(webpPathFor("restaurants/a/menu-items/ai-generated/tea-123.png")).toBe(
      "restaurants/a/menu-items/ai-generated/tea-123.webp"
    );
    expect(webpPathFor("restaurants/a/x.JPEG")).toBe("restaurants/a/x.webp");
  });

  it("converts PNG/JPEG photos in the item's own folder and skips everything else", () => {
    const items = [
      { id: "1", restaurant_id: "r1", image_url: publicUrl("restaurants/chaixpress/menu-items/ai-generated/tea-1.png") },
      { id: "2", restaurant_id: "r1", image_url: publicUrl("restaurants/chaixpress/karak-2.jpg") },
      { id: "3", restaurant_id: "r1", image_url: publicUrl("restaurants/chaixpress/done-3.webp") },
      { id: "4", restaurant_id: "r1", image_url: "https://cdn.example.com/external.png" },
      // Points into another tenant's folder: never rewritten.
      { id: "5", restaurant_id: "r2", image_url: publicUrl("restaurants/chaixpress/stolen-5.png") }
    ];

    const plan = planConversions(items, slugs, SUPABASE);

    expect(plan.convert.map((entry) => entry.item.id)).toEqual(["1", "2"]);
    expect(plan.skipped.map((entry) => entry.item.id)).toEqual(["5"]);
  });

  it("can be limited to one restaurant", () => {
    const items = [
      { id: "1", restaurant_id: "r1", image_url: publicUrl("restaurants/chaixpress/a-1.png") },
      { id: "2", restaurant_id: "r2", image_url: publicUrl("restaurants/other-cafe/b-2.png") }
    ];
    expect(
      planConversions(items, slugs, SUPABASE, { restaurant: "other-cafe" }).convert.map((entry) => entry.item.id)
    ).toEqual(["2"]);
  });
});

describe("convert-menu-images apply", () => {
  const path = "restaurants/chaixpress/menu-items/ai-generated/tea-1.png";
  const item = () => ({ id: "1", restaurant_id: "r1", image_url: publicUrl(path) });
  const toWebp = async (bytes) => Buffer.from(`webp:${bytes.length}`);
  const quiet = () => undefined;

  it("uploads a WebP copy with a long cache, repoints the row, keeps the original", async () => {
    const rows = [item()];
    const fake = fakeClient({ files: { [path]: Buffer.alloc(900_000) }, rows });
    const plan = planConversions(rows.map((row) => ({ ...row })), slugs, SUPABASE);

    const results = await applyConversions(plan, { client: fake.client, toWebp, log: quiet });

    expect(results[0]).toMatchObject({ status: "converted", before: 900_000 });
    expect(fake.uploads[0]).toMatchObject({
      path: path.replace(".png", ".webp"),
      options: { contentType: "image/webp", cacheControl: IMMUTABLE_CACHE_SECONDS, upsert: false }
    });
    expect(fake.updates[0]).toMatchObject({ id: "1", restaurant_id: "r1", image_url: publicUrl(path) });
    expect(rows[0].image_url).toBe(publicUrl(path.replace(".png", ".webp")));
    expect(fake.store.has(path)).toBe(true);
  });

  it("leaves a row alone if staff changed the photo meanwhile", async () => {
    const rows = [item()];
    const fake = fakeClient({ files: { [path]: Buffer.alloc(10) }, rows, rowChangedMeanwhile: ["1"] });
    const results = await applyConversions(planConversions([item()], slugs, SUPABASE), {
      client: fake.client,
      toWebp,
      log: quiet
    });

    expect(results[0].status).toBe("changed-meanwhile");
    expect(rows[0].image_url).toBe(publicUrl(path));
  });

  it("reuses a WebP copy left by an interrupted run", async () => {
    const rows = [item()];
    const fake = fakeClient({
      files: { [path]: Buffer.alloc(10) },
      rows,
      uploadError: { message: "The resource already exists" }
    });
    const results = await applyConversions(planConversions([item()], slugs, SUPABASE), {
      client: fake.client,
      toWebp,
      log: quiet
    });

    expect(results[0].status).toBe("converted");
  });

  it("reports failures without touching the row", async () => {
    const rows = [item()];
    const fake = fakeClient({ files: {}, rows });
    const results = await applyConversions(planConversions([item()], slugs, SUPABASE), {
      client: fake.client,
      toWebp,
      log: quiet
    });

    expect(results[0]).toMatchObject({ status: "failed" });
    expect(fake.updates).toHaveLength(0);
    expect(rows[0].image_url).toBe(publicUrl(path));
  });
});
