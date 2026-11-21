// Convert existing menu item photos to WebP (one-off backfill). Operator tool;
// never run from the app.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/convert-menu-images.mjs [plan|apply] [--restaurant <slug>]
//
// plan   (default) list every menu item whose photo is a PNG/JPEG in the
//        menu-images bucket, with its size; changes nothing.
// apply  for each one: download it, re-encode as WebP (longest edge 1,200 px,
//        quality 82, auto-rotated — exactly what device uploads get), upload
//        it next to the original as `<same name>.webp` with a one-year cache,
//        then point menu_items.image_url at it.
//
// Safety:
// - Only photos stored under that item's own restaurant folder
//   (menu-images/restaurants/<slug>/...) are touched; anything else is
//   reported and skipped.
// - The row update is scoped by id AND restaurant_id AND the old URL, so an
//   image changed by staff while this runs is left alone.
// - Originals are NOT deleted, so the change is reversible: set image_url
//   back to the printed old URL. Remove originals separately once happy.
// - Re-running is safe: converted items already point at .webp and are
//   skipped; an existing .webp from an interrupted run is reused.
//
// The customer menu is cached for 5 minutes, so new URLs appear within ~5 min.

import { pathToFileURL } from "node:url";

export const MENU_IMAGE_BUCKET = "menu-images";
export const IMMUTABLE_CACHE_SECONDS = "31536000";
const PUBLIC_PREFIX = `/storage/v1/object/public/${MENU_IMAGE_BUCKET}/`;

/** Storage path of a public menu-images URL on this project, else null. */
export function storagePathFromUrl(imageUrl, supabaseUrl) {
  if (typeof imageUrl !== "string" || !imageUrl) {
    return null;
  }
  let url;
  try {
    url = new URL(imageUrl);
  } catch {
    return null;
  }
  if (url.origin !== new URL(supabaseUrl).origin || !url.pathname.startsWith(PUBLIC_PREFIX)) {
    return null;
  }
  return decodeURIComponent(url.pathname.slice(PUBLIC_PREFIX.length));
}

/** `a/b/photo-123.png` → `a/b/photo-123.webp` */
export function webpPathFor(path) {
  return path.replace(/\.(png|jpe?g)$/i, ".webp");
}

/**
 * Decide what to do with each menu item.
 * items: [{ id, restaurant_id, image_url }]; slugs: Map(restaurant_id → slug)
 */
export function planConversions(items, slugs, supabaseUrl, { restaurant } = {}) {
  const convert = [];
  const skipped = [];

  for (const item of items) {
    const slug = slugs.get(item.restaurant_id);
    if (restaurant && slug !== restaurant) {
      continue;
    }
    const path = storagePathFromUrl(item.image_url, supabaseUrl);
    if (!path) {
      continue; // External URL or another bucket: not ours to rewrite.
    }
    if (!/\.(png|jpe?g)$/i.test(path)) {
      continue; // Already WebP.
    }
    if (!slug || !path.startsWith(`restaurants/${slug}/`)) {
      skipped.push({ item, path, reason: "photo is not in this restaurant's folder" });
      continue;
    }
    convert.push({ item, path, webpPath: webpPathFor(path) });
  }

  return { convert, skipped };
}

/**
 * Execute a plan. `client` is a supabase-js client (service role);
 * `toWebp(bytes) → Promise<Buffer>` does the re-encode.
 */
export async function applyConversions(plan, { client, toWebp, log = console.log }) {
  const storage = client.storage.from(MENU_IMAGE_BUCKET);
  const results = [];

  for (const { item, path, webpPath } of plan.convert) {
    try {
      const { data: blob, error: downloadError } = await storage.download(path);
      if (downloadError || !blob) {
        throw new Error(`download failed: ${downloadError?.message ?? "no data"}`);
      }
      const original = Buffer.from(await blob.arrayBuffer());
      const webp = await toWebp(original);

      const { error: uploadError } = await storage.upload(webpPath, webp, {
        contentType: "image/webp",
        cacheControl: IMMUTABLE_CACHE_SECONDS,
        upsert: false
      });
      // An earlier interrupted run may already have uploaded it.
      if (uploadError && !/exists|duplicate/i.test(uploadError.message ?? "")) {
        throw new Error(`upload failed: ${uploadError.message}`);
      }

      const newUrl = storage.getPublicUrl(webpPath).data.publicUrl;
      const { data: updated, error: updateError } = await client
        .from("menu_items")
        .update({ image_url: newUrl })
        .eq("id", item.id)
        .eq("restaurant_id", item.restaurant_id)
        .eq("image_url", item.image_url)
        .select("id");
      if (updateError) {
        throw new Error(`update failed: ${updateError.message}`);
      }
      if (!updated || updated.length === 0) {
        results.push({ item, status: "changed-meanwhile", path });
        log(`skip   ${path} (image changed while converting)`);
        continue;
      }

      results.push({ item, status: "converted", path, webpPath, before: original.length, after: webp.length, oldUrl: item.image_url, newUrl });
      log(`done   ${path} ${kb(original.length)} -> ${kb(webp.length)}   (old URL kept: ${item.image_url})`);
    } catch (error) {
      results.push({ item, status: "failed", path, error: error.message });
      log(`FAIL   ${path}: ${error.message}`);
    }
  }

  return results;
}

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

function parseArgs(argv) {
  const options = { mode: "plan", restaurant: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "plan" || arg === "apply") {
      options.mode = arg;
    } else if (arg === "--restaurant") {
      options.restaurant = argv[++index] ?? null;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set ${name}.`);
  }
  return value;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(supabaseUrl, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const [{ data: items, error: itemsError }, { data: restaurants, error: restaurantsError }] =
    await Promise.all([
      client.from("menu_items").select("id, restaurant_id, image_url").not("image_url", "is", null),
      client.from("restaurants").select("id, slug")
    ]);
  if (itemsError || restaurantsError) {
    throw new Error((itemsError ?? restaurantsError).message);
  }

  const slugs = new Map(restaurants.map((row) => [row.id, row.slug]));
  const plan = planConversions(items, slugs, supabaseUrl, options);

  for (const { path, reason } of plan.skipped) {
    console.log(`skip   ${path} (${reason})`);
  }

  if (options.mode === "plan") {
    const storage = client.storage.from(MENU_IMAGE_BUCKET);
    let total = 0;
    for (const { path, webpPath } of plan.convert) {
      const folder = path.slice(0, path.lastIndexOf("/"));
      const name = path.slice(path.lastIndexOf("/") + 1);
      const { data } = await storage.list(folder, { search: name, limit: 1 });
      const size = data?.[0]?.metadata?.size ?? 0;
      total += size;
      console.log(`plan   ${path} (${kb(size)}) -> ${webpPath}`);
    }
    console.log(`\n${plan.convert.length} photo(s) to convert, ${kb(total)} today. Nothing changed. Run with "apply" to convert.`);
    return;
  }

  const { default: sharp } = await import("sharp");
  const toWebp = (bytes) =>
    sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: 1_200, height: 1_200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

  const results = await applyConversions(plan, { client, toWebp });
  const converted = results.filter((row) => row.status === "converted");
  const failed = results.filter((row) => row.status === "failed");
  const before = converted.reduce((sum, row) => sum + row.before, 0);
  const after = converted.reduce((sum, row) => sum + row.after, 0);
  console.log(
    `\nConverted ${converted.length}, changed meanwhile ${results.length - converted.length - failed.length}, failed ${failed.length}. ` +
      `${kb(before)} -> ${kb(after)}. Originals kept.`
  );
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
