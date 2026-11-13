// lib/storage-ownership.ts
//
// Image URLs on menu items and restaurant branding are free text, so a tenant
// can save another tenant's public storage URL. Before a service-role delete,
// the storage path must sit inside the tenant's own folder:
//   menu-images        → restaurants/<slug>/...
//   restaurant-assets  → restaurants/<restaurant id>/...

export function storagePathFromPublicUrl(
  url: string,
  bucketName: string
): string | null {
  const marker = `/storage/v1/object/public/${bucketName}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) {
    return null;
  }
  try {
    return decodeURIComponent(
      url.slice(markerIndex + marker.length).split(/[?#]/)[0]
    );
  } catch {
    return null;
  }
}

/**
 * The storage path for `url` if — and only if — it lies directly inside
 * `restaurants/<folder>/`. Rejects traversal segments and empty folders.
 */
export function ownedStoragePath(
  url: string,
  bucketName: string,
  folder: string
): string | null {
  const path = storagePathFromPublicUrl(url, bucketName);
  if (!path || !folder || folder.includes("/")) {
    return null;
  }
  const prefix = `restaurants/${folder}/`;
  if (!path.startsWith(prefix) || path.length === prefix.length) {
    return null;
  }
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return null;
  }
  return path;
}
