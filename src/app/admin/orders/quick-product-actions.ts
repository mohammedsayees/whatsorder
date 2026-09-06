"use server";
import { revalidatePath } from "next/cache";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isClientOrderId } from "@/lib/staff-order-payload";
import type { MenuItem } from "@/lib/types";

export async function createQuickProduct(input: { id: string; name: string; price: number; categoryId: string }): Promise<{ item?: MenuItem; error?: string; retryUnchanged?: boolean }> {
  const session = await requireRestaurantAdmin();
  const db = getSupabaseAdmin();
  const name = input.name?.trim();
  if (!db || !isClientOrderId(input.id) || !isClientOrderId(input.categoryId) || !name || name.length > 120 || !Number.isFinite(input.price) || input.price <= 0 || input.price > 100000 || Math.abs(input.price * 100 - Math.round(input.price * 100)) > .00001) {
    return { retryUnchanged: false, error: "Enter a name, category and positive price with up to two decimal places." };
  }
  const previous = await db.from("menu_items").select("*").eq("restaurant_id", session.restaurantId).eq("id", input.id).maybeSingle();
  if (previous.error) return { retryUnchanged: true, error: "Could not check the previous save. Retry." };
  if (previous.data) return { item: previous.data as MenuItem };
  const category = await db.from("menu_categories").select("id").eq("id", input.categoryId).eq("restaurant_id", session.restaurantId).eq("is_active", true).maybeSingle();
  if (category.error || !category.data) return { retryUnchanged: false, error: "Choose an active category in this restaurant." };
  const result = await db.from("menu_items").upsert({ id: input.id, restaurant_id: session.restaurantId, category_id: input.categoryId, name, price: input.price, is_available: true, staff_only: true, quick_created_by: session.userId }, { onConflict: "id", ignoreDuplicates: true });
  if (result.error) return { retryUnchanged: true, error: "Product could not be saved. Retry with the same details." };
  const saved = await db.from("menu_items").select("*").eq("restaurant_id", session.restaurantId).eq("id", input.id).single();
  if (saved.error) return { retryUnchanged: true, error: "Could not confirm the product. Retry." };
  revalidatePath("/admin/menu");
  revalidatePath("/admin/orders/new");
  return { item: saved.data as MenuItem };
}
