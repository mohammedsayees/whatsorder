// Client-side menu image compression.
//
// Phone photos chosen for menu items are often 2–3 MB. Uploading them as-is
// makes the customer PWA heavy on mobile data. Before upload we resize the
// longest edge down to ~800px and re-encode as WebP in the browser using a
// canvas — free and one-time, with no recurring transformation/CDN cost.
//
// This module is admin/staff-only. Do NOT import it into the customer bundle.

export const MENU_IMAGE_MAX_EDGE = 800;
export const MENU_IMAGE_WEBP_QUALITY = 0.78;

/**
 * Compute the target canvas dimensions for a source image, scaling so the
 * longest edge is at most `maxEdge`. Images already within `maxEdge` are left
 * untouched (never upscale). Pure + side-effect free so it can be unit tested.
 */
export function fitWithinMaxEdge(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const scale = Math.min(1, maxEdge / longest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function loadImage(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the selected image."));
    image.src = objectUrl;
  });
}

/**
 * Resize + re-encode a menu image to WebP in the browser. Returns a new
 * `image/webp` File on success. If anything goes wrong (canvas unavailable,
 * WebP not encodable, decode failure) the original file is returned unchanged
 * so the upload still succeeds — this is an optimization, not a gate.
 */
export async function compressMenuImage(
  file: File,
  {
    maxEdge = MENU_IMAGE_MAX_EDGE,
    quality = MENU_IMAGE_WEBP_QUALITY
  }: { maxEdge?: number; quality?: number } = {}
): Promise<File> {
  if (typeof document === "undefined") {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const { width, height } = fitWithinMaxEdge(image.width, image.height, maxEdge);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return file;
    }
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality)
    );

    // toBlob returns null, or a non-webp type, when the browser can't encode
    // WebP — keep the original in that case.
    if (!blob || blob.type !== "image/webp") {
      return file;
    }

    const baseName = file.name.replace(/\.[^./\\]+$/, "") || "menu-item";
    return new File([blob], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: Date.now()
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
