import "server-only";

import { redirect } from "next/navigation";
import {
  resolveFinanceAccess,
  type FinanceAccess,
  type FinanceCategory,
  type FinanceExpense,
  type FinancePermission,
  type FinanceRecurringCost,
  type FinanceRolePermissionRow
} from "@/lib/finance";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  requireRestaurantAdmin,
  type RestaurantAdminSession
} from "@/lib/super-admin-auth";

export async function getFinanceAccess(session: RestaurantAdminSession): Promise<FinanceAccess> {
  const featureEnabled = session.restaurant.finance_enabled === true;
  if (!featureEnabled || session.role === "owner" || session.role === "restaurant_admin") {
    return resolveFinanceAccess(featureEnabled, session.role);
  }

  const admin = getSupabaseAdmin();
  if (!admin) return resolveFinanceAccess(featureEnabled, session.role);
  const { data } = await admin
    .from("finance_role_permissions")
    .select("role,can_view,can_create,can_approve,can_manage_categories,can_manage_recurring")
    .eq("restaurant_id", session.restaurantId)
    .eq("role", session.role)
    .maybeSingle();

  return resolveFinanceAccess(
    featureEnabled,
    session.role,
    data as FinanceRolePermissionRow | null
  );
}

export async function requireFinancePermission(permission: FinancePermission) {
  const session = await requireRestaurantAdmin();
  const access = await getFinanceAccess(session);
  if (!access[permission]) {
    redirect("/admin?error=You%20do%20not%20have%20Finance%20permission.");
  }
  return { session, access };
}

export async function getFinanceCategories(restaurantId: string, includeInactive = false) {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  let query = admin
    .from("finance_categories")
    .select("id,restaurant_id,name,classification,default_allocation_months,is_active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (!includeInactive) query = query.eq("is_active", true);
  const { data } = await query;
  return (data ?? []) as FinanceCategory[];
}

export async function getFinanceExpenses(restaurantId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data } = await admin
    .from("finance_expenses")
    .select("id,restaurant_id,category_id,description,supplier_name,incurred_on,subtotal_fils,input_vat_fils,total_fils,vat_inclusive,status,payment_status,payment_method,paid_on,created_at,finance_categories(name,classification)")
    .eq("restaurant_id", restaurantId)
    .order("incurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(250);
  return (data ?? []) as unknown as FinanceExpense[];
}

export async function getFinanceRecurringCosts(restaurantId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data } = await admin
    .from("finance_recurring_costs")
    .select("id,restaurant_id,category_id,description,amount_fils,frequency,allocation_months,start_on,end_on,next_due_on,is_active,finance_categories(name,classification)")
    .eq("restaurant_id", restaurantId)
    .order("is_active", { ascending: false })
    .order("next_due_on");
  return (data ?? []) as unknown as FinanceRecurringCost[];
}

export async function getFinanceRolePermissions(restaurantId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data } = await admin
    .from("finance_role_permissions")
    .select("role,can_view,can_create,can_approve,can_manage_categories,can_manage_recurring")
    .eq("restaurant_id", restaurantId)
    .order("role");
  return (data ?? []) as FinanceRolePermissionRow[];
}
