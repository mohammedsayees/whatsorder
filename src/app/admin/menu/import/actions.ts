"use server";

import { revalidatePath } from "next/cache";
import {
  extractMenuPageItems,
  generateItemDescriptions,
  generateSingleItemDescription,
  translateItemToArabic,
  type DraftMenuItem,
  type ItemTranslation
} from "@/lib/menu-extraction/extract";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantRole } from "@/lib/super-admin-auth";

export type ExtractPageResult =
  | { ok: true; items: DraftMenuItem[] }
  | { ok: false; error: string };

export type DraftImportRow = {
  category: string;
  name: string;
  name_ar: string | null;
  description: string | null;
  price: number;
  is_featured: boolean;
  image_url: string | null;
};

export type ImportResult = { ok: boolean; message: string };

export type DescriptionResult =
  | { ok: true; descriptions: Record<string, string> }
  | { ok: false; error: string };

export async function generateMenuDescriptionsAction(
  items: { name: string; category: string }[]
): Promise<DescriptionResult> {
  await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);

  if (!process.env.GEMINI_API_KEY) {
    return { ok: false, error: "AI descriptions aren't configured yet." };
  }

  try {
    const descriptions = await generateItemDescriptions(
      (Array.isArray(items) ? items : []).slice(0, 200)
    );
    return { ok: true, descriptions };
  } catch {
    return { ok: false, error: "AI couldn't write descriptions just now. Try again." };
  }
}

export type SingleDescriptionResult =
  | { ok: true; description: string }
  | { ok: false; error: string };

// Writes one English description for a single item — powers the "Generate"
// button on the menu item edit form. Admin/staff path only; the customer
// bundle never imports this.
export async function generateItemDescriptionAction(input: {
  name: string;
  category: string;
}): Promise<SingleDescriptionResult> {
  await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);

  if (!process.env.GEMINI_API_KEY) {
    return { ok: false, error: "AI descriptions aren't configured yet." };
  }

  const name = String(input?.name ?? "").trim();
  if (!name) {
    return { ok: false, error: "Add an item name first." };
  }

  try {
    const description = await generateSingleItemDescription(name, String(input?.category ?? ""));
    if (!description) {
      return { ok: false, error: "AI couldn't write a description just now. Try again." };
    }
    return { ok: true, description };
  } catch {
    return { ok: false, error: "AI couldn't write a description just now. Try again." };
  }
}

export type TranslationResult =
  | { ok: true; translation: ItemTranslation }
  | { ok: false; error: string };

// Translates an item's English name/description into Arabic — powers the
// "Translate → عربي" button on the menu item edit form. Admin/staff path only.
export async function translateItemAction(input: {
  name: string;
  description?: string | null;
}): Promise<TranslationResult> {
  await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);

  if (!process.env.GEMINI_API_KEY) {
    return { ok: false, error: "AI translation isn't configured yet." };
  }

  const name = String(input?.name ?? "").trim();
  if (!name) {
    return { ok: false, error: "Add an item name first." };
  }

  try {
    const translation = await translateItemToArabic({
      name,
      description: input?.description ?? null
    });
    if (!translation.name_ar && !translation.description_ar) {
      return { ok: false, error: "AI couldn't translate just now. Try again." };
    }
    return { ok: true, translation };
  } catch {
    return { ok: false, error: "AI couldn't translate just now. Try again." };
  }
}

// One rendered page is ~0.1-0.4 MB as JPEG; base64 inflates ~33%. Reject
// anything clearly too large to keep the request under the body-size limit.
const MAX_IMAGE_BASE64_LENGTH = 10_000_000;
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function extractMenuPageAction(input: {
  imageBase64: string;
  mimeType: string;
}): Promise<ExtractPageResult> {
  await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);

  if (!process.env.GEMINI_API_KEY) {
    return { ok: false, error: "Menu import is not configured yet. Contact WhatsOrder support." };
  }

  if (!allowedMimeTypes.has(input.mimeType)) {
    console.error("WhatsOrder menu import rejected page", {
      reason: "mime",
      mimeType: input.mimeType
    });
    return { ok: false, error: "Unsupported image type." };
  }

  if (!input.imageBase64 || input.imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
    console.error("WhatsOrder menu import rejected page", {
      reason: "size",
      length: input.imageBase64?.length ?? 0
    });
    return {
      ok: false,
      error: "This page image is too large to read. Try a smaller photo or a PDF."
    };
  }

  try {
    const items = await extractMenuPageItems(input.imageBase64, input.mimeType);
    return { ok: true, items };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "MENU_EXTRACTION_NOT_CONFIGURED") {
      return { ok: false, error: "Menu import is not configured yet. Contact WhatsOrder support." };
    }

    // fetchGeminiWithRetry throws "REQUEST_FAILED:<status|reason>". A transient
    // overload/rate-limit survived the retries — tell the user to retry rather
    // than implying their page is unreadable. A hard 4xx is a real config issue.
    const status = code.startsWith("REQUEST_FAILED:") ? code.slice("REQUEST_FAILED:".length) : "";
    if (status === "429" || status === "503" || status === "500" || status === "502" || status === "504") {
      return {
        ok: false,
        error: "The AI reader is busy right now. Wait a few seconds and try again."
      };
    }
    if (status === "400" || status === "401" || status === "403") {
      return {
        ok: false,
        error: "The AI reader rejected the request — this needs a fix on our side. Contact WhatsOrder support."
      };
    }

    return {
      ok: false,
      error: "Couldn't read this page. Try again, or skip it and add those items by hand."
    };
  }
}

export async function importDraftMenuAction(rows: DraftImportRow[]): Promise<ImportResult> {
  const session = await requireRestaurantRole(["restaurant_admin", "owner", "manager"]);
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return { ok: false, message: "Menu import needs Supabase write access." };
  }

  const validRows = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      category: String(row.category ?? "").trim() || "Menu",
      name: String(row.name ?? "").trim().slice(0, 120),
      name_ar: row.name_ar ? String(row.name_ar).trim().slice(0, 120) : null,
      description: row.description ? String(row.description).trim().slice(0, 300) : null,
      price: Number(row.price),
      is_featured: row.is_featured === true,
      image_url: row.image_url ? String(row.image_url).trim() : null
    }))
    .filter((row) => row.name && Number.isFinite(row.price) && row.price >= 0)
    .slice(0, 300);

  if (validRows.length === 0) {
    return { ok: false, message: "There are no valid items to import." };
  }

  // Reuse the existing menu shape: upsert categories by name, then insert items.
  const { data: existingCategories } = await supabase
    .from("menu_categories")
    .select("id,name,display_order")
    .eq("restaurant_id", session.restaurantId);

  const categoriesByName = new Map(
    (existingCategories ?? []).map((category) => [
      String(category.name).trim().toLowerCase(),
      category
    ])
  );
  let nextDisplayOrder = (existingCategories ?? []).length + 1;

  for (const categoryName of [...new Set(validRows.map((row) => row.category))]) {
    const key = categoryName.toLowerCase();
    if (categoriesByName.has(key)) {
      continue;
    }

    const { data, error } = await supabase
      .from("menu_categories")
      .insert({
        restaurant_id: session.restaurantId,
        name: categoryName,
        display_order: nextDisplayOrder,
        is_active: true
      })
      .select("id,name,display_order")
      .single();

    if (error) {
      return { ok: false, message: `Could not create category "${categoryName}".` };
    }

    nextDisplayOrder += 1;
    if (data) {
      categoriesByName.set(key, data);
    }
  }

  const itemsToInsert = validRows
    .map((row) => {
      const category = categoriesByName.get(row.category.toLowerCase());
      if (!category) {
        return null;
      }
      return {
        restaurant_id: session.restaurantId,
        category_id: category.id,
        name: row.name,
        name_ar: row.name_ar,
        description: row.description,
        price: row.price,
        image_url: row.image_url,
        is_available: true,
        is_featured: row.is_featured
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const { error: insertError } = await supabase.from("menu_items").insert(itemsToInsert);

  if (insertError) {
    return { ok: false, message: "Some items could not be saved. Please try again." };
  }

  revalidatePath("/admin/menu");
  revalidatePath(`/r/${session.restaurant.slug}`);

  return { ok: true, message: `Imported ${itemsToInsert.length} items.` };
}
