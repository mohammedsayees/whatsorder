import "server-only";

import { CHAT_MEDIA_BUCKET } from "@/lib/chat-media";
import { FINANCE_DOCUMENT_BUCKET } from "@/lib/finance-upload";
import { POSTER_BUCKET } from "@/lib/poster/types";
import { getSupabaseAdmin } from "@/lib/supabase";

type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export const MENU_IMAGE_BUCKET = "menu-images";
export const RESTAURANT_ASSET_BUCKET = "restaurant-assets";

export type RestaurantDeletionPreview = {
  orders: number;
  customers: number;
  menuItems: number;
  teamMembers: number;
};

export type StoragePlan = { bucket: string; paths: string[] }[];

async function count(admin: AdminClient, table: string, restaurantId: string) {
  const { count: rows } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId);
  return rows ?? 0;
}

export async function getRestaurantDeletionPreview(
  admin: AdminClient,
  restaurantId: string
): Promise<RestaurantDeletionPreview> {
  const [orders, customers, menuItems, teamMembers] = await Promise.all([
    count(admin, "orders", restaurantId),
    count(admin, "customers", restaurantId),
    count(admin, "menu_items", restaurantId),
    count(admin, "restaurant_users", restaurantId)
  ]);
  return { orders, customers, menuItems, teamMembers };
}

// "https://x.supabase.co/storage/v1/object/public/menu-images/restaurants/a/b.jpg?t=1"
// -> "restaurants/a/b.jpg" (for the given bucket only).
export function storagePathFromPublicUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url) {
    return null;
  }
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index < 0) {
    return null;
  }
  try {
    return decodeURIComponent(url.slice(index + marker.length).split("?")[0]) || null;
  } catch {
    return null;
  }
}

// Every file under a folder, following sub-folders (Supabase lists one level
// at a time; folders come back without an id).
async function listFolderRecursive(
  admin: AdminClient,
  bucket: string,
  folder: string,
  depth = 0
): Promise<string[]> {
  if (depth > 6) {
    return [];
  }
  const files: string[] = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000, offset });
    if (error || !data || data.length === 0) {
      break;
    }
    for (const entry of data) {
      const path = `${folder}/${entry.name}`;
      if (entry.id) {
        files.push(path);
      } else {
        files.push(...(await listFolderRecursive(admin, bucket, path, depth + 1)));
      }
    }
    if (data.length < 1000) {
      break;
    }
  }
  return files;
}

// Works out which stored files belong to this restaurant, BEFORE its rows are
// deleted (the database is the map to most of them).
//
// - Buckets filed by restaurant id (brand images, finance documents, chat
//   media, posters) are wiped by folder: the id is unique forever.
// - Menu photos are filed by store link, which can change and be reused by
//   another café later. So only photos this restaurant references or that sit
//   in its current folder are candidates, and any photo another restaurant
//   still references is kept.
export async function planRestaurantStorageCleanup(
  admin: AdminClient,
  restaurant: { id: string; slug: string; logo_url?: string | null; cover_image_url?: string | null }
): Promise<StoragePlan> {
  const plan: StoragePlan = [];

  const idFolders: [string, string][] = [
    [RESTAURANT_ASSET_BUCKET, `restaurants/${restaurant.id}`],
    [FINANCE_DOCUMENT_BUCKET, restaurant.id],
    [CHAT_MEDIA_BUCKET, restaurant.id],
    [POSTER_BUCKET, restaurant.id]
  ];
  for (const [bucket, folder] of idFolders) {
    const paths = await listFolderRecursive(admin, bucket, folder);
    if (paths.length > 0) {
      plan.push({ bucket, paths });
    }
  }

  const [{ data: items }, { data: generations }] = await Promise.all([
    admin.from("menu_items").select("image_url").eq("restaurant_id", restaurant.id),
    admin.from("ai_image_generations").select("image_url").eq("restaurant_id", restaurant.id)
  ]);
  const candidates = new Set<string>();
  for (const row of [...(items ?? []), ...(generations ?? [])]) {
    const path = storagePathFromPublicUrl(row.image_url as string | null, MENU_IMAGE_BUCKET);
    if (path) {
      candidates.add(path);
    }
  }
  for (const path of await listFolderRecursive(admin, MENU_IMAGE_BUCKET, `restaurants/${restaurant.slug}`)) {
    candidates.add(path);
  }

  if (candidates.size > 0) {
    // Folders the candidates live in; look up other restaurants' references
    // inside those folders and keep anything still in use elsewhere.
    const folders = new Set([...candidates].map((path) => path.split("/").slice(0, 2).join("/")));
    const protectedPaths = new Set<string>();
    for (const folder of folders) {
      const pattern = `%/${MENU_IMAGE_BUCKET}/${folder}/%`;
      const [{ data: otherItems }, { data: otherGenerations }] = await Promise.all([
        admin.from("menu_items").select("image_url").neq("restaurant_id", restaurant.id).like("image_url", pattern),
        admin
          .from("ai_image_generations")
          .select("image_url")
          .neq("restaurant_id", restaurant.id)
          .like("image_url", pattern)
      ]);
      for (const row of [...(otherItems ?? []), ...(otherGenerations ?? [])]) {
        const path = storagePathFromPublicUrl(row.image_url as string | null, MENU_IMAGE_BUCKET);
        if (path) {
          protectedPaths.add(path);
        }
      }
    }
    const paths = [...candidates].filter((path) => !protectedPaths.has(path));
    if (paths.length > 0) {
      plan.push({ bucket: MENU_IMAGE_BUCKET, paths });
    }
  }

  return plan;
}

export async function executeStorageCleanup(admin: AdminClient, plan: StoragePlan) {
  let removed = 0;
  let failed = 0;
  for (const { bucket, paths } of plan) {
    for (let index = 0; index < paths.length; index += 100) {
      const batch = paths.slice(index, index + 100);
      const { error } = await admin.storage.from(bucket).remove(batch);
      if (error) {
        failed += batch.length;
        console.error("WhatsOrder restaurant storage cleanup failed", { bucket, message: error.message });
      } else {
        removed += batch.length;
      }
    }
  }
  return { removed, failed };
}

// Sign-ins that existed only to work at this restaurant. Read BEFORE the
// delete (memberships cascade away with it).
export async function memberUserIds(admin: AdminClient, restaurantId: string): Promise<string[]> {
  const { data } = await admin
    .from("restaurant_users")
    .select("user_id")
    .eq("restaurant_id", restaurantId)
    .not("user_id", "is", null);
  return [...new Set((data ?? []).map((row) => String(row.user_id)))];
}

// After the delete: remove each former member's Auth account unless they
// still belong to another restaurant or are a super admin. Profiles cascade
// with the Auth user.
export async function removeOrphanedMemberAccounts(admin: AdminClient, userIds: string[]) {
  let removed = 0;
  let kept = 0;
  for (const userId of userIds) {
    const [{ count: otherMemberships }, { data: profile }] = await Promise.all([
      admin.from("restaurant_users").select("id", { count: "exact", head: true }).eq("user_id", userId),
      admin.from("profiles").select("role").eq("id", userId).maybeSingle()
    ]);
    if ((otherMemberships ?? 0) > 0 || profile?.role === "super_admin") {
      kept += 1;
      continue;
    }
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      kept += 1;
      console.error("WhatsOrder member account cleanup failed", { userId, message: error.message });
    } else {
      removed += 1;
    }
  }
  return { removed, kept };
}
