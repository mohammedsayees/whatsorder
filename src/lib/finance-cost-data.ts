import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

export type FinanceIngredient = {
  id: string;
  restaurant_id: string;
  name: string;
  kind: "ingredient" | "packaging";
  canonical_unit: "g" | "ml" | "each";
  yield_pct: number;
  is_active: boolean;
};

export async function getFinanceCostingWorkspace(restaurantId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return { ingredients: [], prices: [], purchaseLines: [] };
  const [{ data: ingredients }, { data: prices }, { data: purchaseLines }] = await Promise.all([
    admin.from("finance_ingredients")
      .select("id,restaurant_id,name,kind,canonical_unit,yield_pct,is_active")
      .eq("restaurant_id", restaurantId).order("name"),
    admin.from("finance_purchase_prices")
      .select("id,ingredient_id,supplier_name,effective_on,pack_count,pack_size,pack_unit,total_cost_fils,normalized_unit_cost_fils,created_at")
      .eq("restaurant_id", restaurantId).order("effective_on", { ascending: false }).limit(250),
    admin.from("finance_expense_lines")
      .select("id,expense_id,description,quantity,unit,amount_fils,ingredient_id,finance_expenses!inner(supplier_name,incurred_on,status)")
      .eq("restaurant_id", restaurantId).eq("classification", "purchase")
      .eq("finance_expenses.status", "approved").order("created_at", { ascending: false }).limit(100)
  ]);
  return {
    ingredients: (ingredients ?? []) as FinanceIngredient[],
    prices: prices ?? [],
    purchaseLines: purchaseLines ?? []
  };
}

export async function getFinanceRecipeWorkspace(restaurantId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return { ingredients: [], items: [], links: [], options: [], recipes: [], lines: [] };
  const [ingredientsResult, itemsResult, linksResult, optionsResult, recipesResult, linesResult] = await Promise.all([
    admin.from("finance_ingredients").select("id,name,kind,canonical_unit,yield_pct,is_active")
      .eq("restaurant_id", restaurantId).eq("is_active", true).order("name"),
    admin.from("menu_items").select("id,name,name_ar,is_available")
      .eq("restaurant_id", restaurantId).order("name"),
    admin.from("menu_item_option_groups").select("menu_item_id,group_id")
      .eq("restaurant_id", restaurantId),
    admin.from("menu_options").select("id,group_id,name,name_ar,is_available")
      .eq("restaurant_id", restaurantId).order("name"),
    admin.from("finance_recipes").select("id,menu_item_id,menu_option_id,effective_from,effective_to,revision,status,created_at")
      .eq("restaurant_id", restaurantId).order("effective_from", { ascending: false }),
    admin.from("finance_recipe_lines").select("id,recipe_id,ingredient_id,canonical_quantity,waste_pct,display_order")
      .eq("restaurant_id", restaurantId).order("display_order")
  ]);
  return {
    ingredients: ingredientsResult.data ?? [], items: itemsResult.data ?? [],
    links: linksResult.data ?? [], options: optionsResult.data ?? [],
    recipes: recipesResult.data ?? [], lines: linesResult.data ?? []
  };
}

export async function getFinanceSettings(restaurantId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin.from("finance_settings")
    .select("restaurant_id,cost_basis,prices_include_vat,output_vat_rate_bps,direct_fee_bps")
    .eq("restaurant_id", restaurantId).maybeSingle();
  return data;
}

export type FinancePilotReadiness = {
  base_recipe_count: number;
  complete_snapshot_count: number;
  coverage_pct: number;
  menu_item_count: number;
  priced_ingredient_count: number;
  ready_for_reconciliation: boolean;
  ready_for_release: boolean;
  recurring_cost_count: number;
  snapshot_count: number;
};

export async function getFinancePilotStatus(restaurantId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const [{ data: enrollment }, { data: readiness, error }] = await Promise.all([
    admin.from("finance_pilot_enrollments")
      .select("status,sample_start,sample_end,reconciled_at,released_at,readiness_snapshot")
      .eq("restaurant_id", restaurantId).maybeSingle(),
    admin.rpc("get_finance_pilot_readiness", { target_restaurant_id: restaurantId })
  ]);
  if (error || !enrollment || !readiness) return null;
  return { enrollment, readiness: readiness as FinancePilotReadiness };
}
