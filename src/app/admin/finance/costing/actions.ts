"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isIsoDate, parseAedToFils, requiredText } from "@/lib/finance";
import { requireFinancePermission } from "@/lib/finance-data";
import { getSupabaseAdmin } from "@/lib/supabase";

const ingredientsPath = "/admin/finance/ingredients";
const recipesPath = "/admin/finance/recipes";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function positiveDecimal(value: FormDataEntryValue | null, maximum = 1_000_000) {
  const raw = String(value ?? "").trim();
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= maximum ? parsed : null;
}

export async function createFinanceIngredientAction(formData: FormData) {
  const { session } = await requireFinancePermission("manage_costing");
  const admin = getSupabaseAdmin();
  if (!admin) fail(ingredientsPath, "Finance costing is unavailable.");
  const name = requiredText(formData.get("name"), 120);
  const kind = String(formData.get("kind") ?? "ingredient");
  const canonicalUnit = String(formData.get("canonical_unit") ?? "");
  const yieldPct = positiveDecimal(formData.get("yield_pct"), 100);
  if (!name || !["ingredient", "packaging"].includes(kind) || !["g", "ml", "each"].includes(canonicalUnit) || yieldPct === null) {
    fail(ingredientsPath, "Enter a valid ingredient, unit, and usable yield.");
  }
  const { error } = await admin.from("finance_ingredients").insert({
    restaurant_id: session.restaurantId, name, kind, canonical_unit: canonicalUnit,
    yield_pct: yieldPct, created_by: session.userId, updated_by: session.userId
  });
  if (error) fail(ingredientsPath, "That ingredient could not be created. Names must be unique.");
  revalidatePath(ingredientsPath);
  redirect(`${ingredientsPath}?success=${encodeURIComponent("Ingredient created.")}`);
}

export async function confirmFinancePurchasePriceAction(formData: FormData) {
  const { session } = await requireFinancePermission("manage_costing");
  const admin = getSupabaseAdmin();
  if (!admin) fail(ingredientsPath, "Finance costing is unavailable.");
  const ingredientId = String(formData.get("ingredient_id") ?? "");
  const sourceLineId = String(formData.get("source_line_id") ?? "") || null;
  const supplierName = requiredText(formData.get("supplier_name"), 160) ?? "";
  const effectiveOn = String(formData.get("effective_on") ?? "");
  const packCount = positiveDecimal(formData.get("pack_count"));
  const packSize = positiveDecimal(formData.get("pack_size"));
  const packUnit = String(formData.get("pack_unit") ?? "");
  const totalCostFils = parseAedToFils(formData.get("total_cost"));
  if (!ingredientId || !isIsoDate(effectiveOn) || packCount === null || packSize === null ||
      !["g", "kg", "ml", "l", "each"].includes(packUnit) || totalCostFils === null) {
    fail(ingredientsPath, "Enter a valid dated pack size and total cost.");
  }
  const { error } = await admin.rpc("confirm_finance_purchase_price", {
    target_restaurant_id: session.restaurantId, target_ingredient_id: ingredientId,
    target_source_line_id: sourceLineId, requested_supplier_name: supplierName,
    requested_effective_on: effectiveOn, requested_pack_count: packCount,
    requested_pack_size: packSize, requested_pack_unit: packUnit,
    requested_total_cost_fils: totalCostFils, event_actor_user_id: session.userId
  });
  if (error) fail(ingredientsPath, "The price could not be confirmed. Check unit compatibility and source line.");
  revalidatePath(ingredientsPath); revalidatePath(recipesPath);
  redirect(`${ingredientsPath}?success=${encodeURIComponent("Purchase price confirmed.")}`);
}

type RecipeLineInput = { ingredientId?: unknown; quantity?: unknown; wastePct?: unknown };

function parseRecipeLines(raw: string) {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value) || value.length > 100) return null;
    const lines = value.map((line) => {
      if (!line || typeof line !== "object") return null;
      const input = line as RecipeLineInput;
      const ingredientId = String(input.ingredientId ?? "");
      const canonicalQuantity = positiveDecimal(String(input.quantity ?? ""));
      const wasteRaw = String(input.wastePct ?? "0");
      const wastePct = /^(?:0|[1-9]\d{0,2})(?:\.\d{1,3})?$/.test(wasteRaw) ? Number(wasteRaw) : NaN;
      return ingredientId && canonicalQuantity !== null && Number.isFinite(wastePct) && wastePct <= 500
        ? { ingredient_id: ingredientId, canonical_quantity: canonicalQuantity, waste_pct: wastePct }
        : null;
    });
    return lines.every(Boolean) ? lines : null;
  } catch { return null; }
}

export async function createFinanceRecipeRevisionAction(formData: FormData) {
  const { session } = await requireFinancePermission("manage_costing");
  const admin = getSupabaseAdmin();
  if (!admin) fail(recipesPath, "Finance costing is unavailable.");
  const menuItemId = String(formData.get("menu_item_id") ?? "");
  const menuOptionId = String(formData.get("menu_option_id") ?? "") || null;
  const effectiveFrom = String(formData.get("effective_from") ?? "");
  const lines = parseRecipeLines(String(formData.get("lines_json") ?? "[]"));
  if (!menuItemId || !isIsoDate(effectiveFrom) || !lines || (!menuOptionId && lines.length === 0)) {
    fail(recipesPath, "Review the recipe date and quantities. A base item must have at least one cost line.");
  }
  const { error } = await admin.rpc("create_finance_recipe_revision", {
    target_restaurant_id: session.restaurantId, target_menu_item_id: menuItemId,
    target_menu_option_id: menuOptionId, requested_effective_from: effectiveFrom,
    requested_lines: lines, event_actor_user_id: session.userId
  });
  if (error) fail(recipesPath, "The revision could not be saved. Check for duplicate ingredients or overlapping dates.");
  revalidatePath(recipesPath);
  redirect(`${recipesPath}?success=${encodeURIComponent("Recipe revision saved. Existing snapshots were not changed.")}`);
}

export async function updateFinanceCostSettingsAction(formData: FormData) {
  const { session } = await requireFinancePermission("manage_costing");
  const admin = getSupabaseAdmin();
  if (!admin) fail(recipesPath, "Finance costing is unavailable.");
  const costBasis = String(formData.get("cost_basis") ?? "latest");
  const rate = positiveDecimal(formData.get("output_vat_rate"), 100) ?? (String(formData.get("output_vat_rate")) === "0" ? 0 : null);
  const fee = positiveDecimal(formData.get("direct_fee_rate"), 100) ?? (String(formData.get("direct_fee_rate")) === "0" ? 0 : null);
  if (!["latest", "weighted_average"].includes(costBasis) || rate === null || fee === null) fail(recipesPath, "Enter valid costing settings.");
  const { error } = await admin.from("finance_settings").update({
    cost_basis: costBasis, prices_include_vat: formData.get("prices_include_vat") === "on",
    output_vat_rate_bps: Math.round(rate * 100), direct_fee_bps: Math.round(fee * 100),
    updated_by: session.userId
  }).eq("restaurant_id", session.restaurantId);
  if (error) fail(recipesPath, "Costing settings could not be updated.");
  revalidatePath(recipesPath); redirect(`${recipesPath}?success=${encodeURIComponent("Costing settings updated.")}`);
}

export async function advanceFinancePilotAction(formData: FormData) {
  const { session } = await requireFinancePermission("manage_costing");
  const admin = getSupabaseAdmin();
  const overviewPath = "/admin/finance/overview";
  if (!admin) fail(overviewPath, "Finance pilot controls are unavailable.");
  if (session.restaurant.slug !== "chaixpress") fail(overviewPath, "Pilot controls are limited to Chai Xpress.");
  const status = String(formData.get("status") ?? "");
  const sampleStart = String(formData.get("sample_start") ?? "") || null;
  const sampleEnd = String(formData.get("sample_end") ?? "") || null;
  if (!["configured", "reconciled", "released", "paused"].includes(status) ||
      ((sampleStart && !isIsoDate(sampleStart)) || (sampleEnd && !isIsoDate(sampleEnd))) ||
      ((status === "reconciled" || status === "released") && formData.get("confirmed") !== "yes")) {
    fail(overviewPath, "Review the requested pilot state and confirm the reconciliation check.");
  }
  const { error } = await admin.rpc("advance_finance_pilot", {
    target_restaurant_id: session.restaurantId, requested_status: status,
    requested_sample_start: sampleStart, requested_sample_end: sampleEnd,
    event_actor_user_id: session.userId
  });
  if (error) fail(overviewPath, error.message || "The pilot gate was not satisfied.");
  revalidatePath(overviewPath);
  redirect(`${overviewPath}?success=${encodeURIComponent(`Pilot moved to ${status}.`)}`);
}
