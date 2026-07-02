"use server";

import { revalidatePath } from "next/cache";
import { generateMenuItemImage } from "@/lib/ai/google-image";
import {
  DEFAULT_AI_IMAGE_STYLE_PRESET,
  isAiImageStylePreset
} from "@/lib/ai/image-style-presets";
import { revalidatePublicRestaurantCache } from "@/lib/public-cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  requireRestaurantRole,
  requireSuperAdmin
} from "@/lib/super-admin-auth";

// Soft per-restaurant cap so generation cost can't run away. Counted server-side
// against the ai_image_generations log over the current UAE day. Tune here.
const DAILY_GENERATION_LIMIT = 20;

export type GenerateMenuItemImageResult =
  | { ok: true; generationId: string; previewUrl: string }
  | { ok: false; error: string };

export type ConfirmGeneratedMenuItemImageResult =
  | { ok: true; imageUrl: string }
  | { ok: false; error: string };

type AiImageContext = {
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>;
  restaurant: { id: string; slug: string; name: string };
  userId: string;
};

// Resolves the tenant + actor the same way the menu write actions do: the
// restaurant-admin/owner/manager session by default, or a specific restaurant
// when a super admin is acting on a tenant's behalf (the editor passes
// restaurantId only on the super-admin path). Returns null when Supabase
// write access is unavailable (demo mode).
async function getAiImageContext(restaurantId?: string): Promise<AiImageContext | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  const requested = (restaurantId ?? "").trim();
  if (requested) {
    const session = await requireSuperAdmin();
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select("id,slug,name")
      .eq("id", requested)
      .maybeSingle();

    return restaurant
      ? { supabase, restaurant, userId: session.userId }
      : null;
  }

  const session = await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
  return {
    supabase,
    restaurant: {
      id: session.restaurant.id,
      slug: session.restaurant.slug,
      name: session.restaurant.name
    },
    userId: session.userId
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

// Start of "today" in UAE time (UTC+4) as an ISO instant — the window the daily
// cap is counted over.
function uaeDayStartIso(): string {
  const nowUae = new Date(Date.now() + 4 * 60 * 60 * 1000);
  const day = nowUae.toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00+04:00`).toISOString();
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
};

// Maps a friendly message to the hard errors thrown by the generation service /
// fetch retry helper so the admin sees something actionable, not a stack trace.
function friendlyGenerationError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";

  if (code === "AI_IMAGE_NOT_CONFIGURED") {
    return "AI image generation isn't configured yet. Add GEMINI_API_KEY to enable it.";
  }
  if (code === "AI_IMAGE_NO_OUTPUT") {
    return "The AI didn't return an image this time. Try again or pick another style.";
  }

  const status = code.startsWith("REQUEST_FAILED:") ? code.slice("REQUEST_FAILED:".length) : "";
  if (["429", "500", "502", "503", "504", "network", "TimeoutError"].includes(status)) {
    return "The AI image service is busy right now. Wait a few seconds and try again.";
  }
  if (["400", "401", "403"].includes(status)) {
    return "The AI image service rejected the request — this needs a fix on our side. Contact WhatsOrder support.";
  }

  return "Couldn't generate an image just now. Please try again.";
}

/**
 * Admin-only: generates a food image for a menu item and stores it as a PREVIEW.
 * The menu item's image is NOT changed here — the admin must confirm via
 * confirmGeneratedMenuItemImageAction. Returns the generation id + a public
 * preview URL.
 */
export async function generateMenuItemImageAction(input: {
  menuItemId: string;
  stylePreset: string;
  restaurantId?: string;
}): Promise<GenerateMenuItemImageResult> {
  const context = await getAiImageContext(input?.restaurantId);
  if (!context) {
    return { ok: false, error: "AI image generation needs Supabase access." };
  }

  const { supabase, restaurant, userId } = context;
  const menuItemId = String(input?.menuItemId ?? "").trim();
  if (!menuItemId) {
    return { ok: false, error: "Save the item first, then generate an image." };
  }

  const stylePreset = isAiImageStylePreset(String(input?.stylePreset ?? ""))
    ? String(input.stylePreset)
    : DEFAULT_AI_IMAGE_STYLE_PRESET;

  // Fetch the item scoped to the tenant — this both supplies the prompt inputs
  // and proves the item belongs to the restaurant the actor is allowed to edit.
  const { data: item } = await supabase
    .from("menu_items")
    .select("id,name,description,price,category_id")
    .eq("id", menuItemId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  if (!item) {
    return { ok: false, error: "That menu item could not be found." };
  }

  const { data: category } = await supabase
    .from("menu_categories")
    .select("name")
    .eq("id", item.category_id)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  // Soft daily cap, enforced server-side. Counts non-failed generations in the
  // current UAE day for this restaurant.
  const { count } = await supabase
    .from("ai_image_generations")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurant.id)
    .neq("status", "failed")
    .gte("created_at", uaeDayStartIso());

  if ((count ?? 0) >= DAILY_GENERATION_LIMIT) {
    return {
      ok: false,
      error: "Daily AI image generation limit reached. Try again tomorrow."
    };
  }

  let generated;
  try {
    generated = await generateMenuItemImage({
      restaurantName: restaurant.name,
      productName: item.name,
      categoryName: category?.name ?? "Menu",
      description: item.description,
      price: item.price,
      stylePreset
    });
  } catch (error) {
    // Log the failed attempt for the audit trail, then surface a friendly error.
    // Best-effort: a logging failure must not mask the original error.
    await supabase
      .from("ai_image_generations")
      .insert({
        restaurant_id: restaurant.id,
        menu_item_id: menuItemId,
        created_by: userId,
        model: process.env.GEMINI_IMAGE_MODEL ?? process.env.GOOGLE_IMAGE_MODEL ?? "gemini-2.5-flash-image",
        prompt: "",
        style_preset: stylePreset,
        image_url: "",
        status: "failed",
        error_message: (error instanceof Error ? error.message : "unknown").slice(0, 500)
      })
      .then(() => undefined, () => undefined);

    return { ok: false, error: friendlyGenerationError(error) };
  }

  const extension = EXTENSION_BY_MIME[generated.mimeType] ?? "png";
  const bucketName = "menu-images";
  const itemSlug = slugify(item.name) || "menu-item";
  const filePath = `restaurants/${restaurant.slug}/menu-items/ai-generated/${itemSlug}-${Date.now()}.${extension}`;

  const uploadFile = () =>
    supabase.storage
      .from(bucketName)
      .upload(filePath, generated.imageBuffer, {
        contentType: generated.mimeType,
        upsert: false
      });

  let { error: uploadError } = await uploadFile();

  // Same lazy-create fallback the device-upload action uses, for fresh projects
  // that haven't run the storage-provisioning migration.
  if (uploadError && uploadError.message.toLowerCase().includes("bucket")) {
    const { error: bucketError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 2 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
    });
    if (bucketError && !bucketError.message.toLowerCase().includes("already exists")) {
      return { ok: false, error: "Couldn't save the generated image. Please try again." };
    }
    const retry = await uploadFile();
    uploadError = retry.error;
  }

  if (uploadError) {
    return { ok: false, error: "Couldn't save the generated image. Please try again." };
  }

  const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
  const previewUrl = publicUrlData.publicUrl;

  const { data: generation, error: insertError } = await supabase
    .from("ai_image_generations")
    .insert({
      restaurant_id: restaurant.id,
      menu_item_id: menuItemId,
      created_by: userId,
      model: generated.model,
      prompt: generated.prompt,
      style_preset: stylePreset,
      image_url: previewUrl,
      storage_public_id: filePath,
      status: "generated"
    })
    .select("id")
    .single();

  if (insertError || !generation) {
    // Don't leave an orphaned object if we couldn't record the generation.
    await supabase.storage.from(bucketName).remove([filePath]);
    return { ok: false, error: "Couldn't save the generated image. Please try again." };
  }

  return { ok: true, generationId: generation.id, previewUrl };
}

/**
 * Admin-only: applies a previously generated preview to the menu item. Only here
 * does the menu item's image_url change. Re-validates auth/tenant access and
 * marks the generation confirmed.
 */
export async function confirmGeneratedMenuItemImageAction(input: {
  generationId: string;
  restaurantId?: string;
}): Promise<ConfirmGeneratedMenuItemImageResult> {
  const context = await getAiImageContext(input?.restaurantId);
  if (!context) {
    return { ok: false, error: "AI image generation needs Supabase access." };
  }

  const { supabase, restaurant } = context;
  const generationId = String(input?.generationId ?? "").trim();
  if (!generationId) {
    return { ok: false, error: "Nothing to apply. Generate an image first." };
  }

  const { data: generation } = await supabase
    .from("ai_image_generations")
    .select("id,menu_item_id,image_url,status")
    .eq("id", generationId)
    .eq("restaurant_id", restaurant.id)
    .maybeSingle();

  if (!generation || !generation.image_url) {
    return { ok: false, error: "That generated image could not be found." };
  }

  const { error: updateError } = await supabase
    .from("menu_items")
    .update({ image_url: generation.image_url })
    .eq("id", generation.menu_item_id)
    .eq("restaurant_id", restaurant.id);

  if (updateError) {
    // Keep the generation record; do not overwrite the existing image.
    return { ok: false, error: "Couldn't apply the image to the item. Please try again." };
  }

  await supabase
    .from("ai_image_generations")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", generation.id)
    .eq("restaurant_id", restaurant.id);

  // Mark the "add images" onboarding task complete, mirroring the device-upload
  // action. Best-effort.
  await supabase
    .from("onboarding_tasks")
    .update({ is_completed: true, completed_at: new Date().toISOString() })
    .eq("restaurant_id", restaurant.id)
    .in("task_key", ["images_added"])
    .then(() => undefined, () => undefined);

  // The image renders on the public menu, so revalidate it alongside the admin
  // editor — same set the device-upload action revalidates.
  revalidatePath("/admin/menu");
  revalidatePath(`/r/${restaurant.slug}`);
  revalidatePath(`/super-admin/restaurants/${restaurant.id}`);
  revalidatePublicRestaurantCache(restaurant);

  return { ok: true, imageUrl: generation.image_url };
}
