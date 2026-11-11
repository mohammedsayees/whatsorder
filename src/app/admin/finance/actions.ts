"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  FINANCE_CLASSIFICATIONS,
  FINANCE_FREQUENCIES,
  isIsoDate,
  parseAedToFils,
  requiredText,
  splitInclusiveVat,
  type FinanceClassification,
  type FinanceFrequency
} from "@/lib/finance";
import { requireFinancePermission } from "@/lib/finance-data";
import { getSupabaseAdmin } from "@/lib/supabase";

function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function unavailable(path: string): never {
  fail(path, "Finance is unavailable. Try again later.");
}

function checked(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

async function categoryBelongsToRestaurant(categoryId: string, restaurantId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data } = await admin
    .from("finance_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true)
    .maybeSingle();
  return Boolean(data);
}

async function recurringBelongsToRestaurant(recurringId: string, restaurantId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data } = await admin.from("finance_recurring_costs").select("id")
    .eq("id", recurringId).eq("restaurant_id", restaurantId).eq("is_active", true).maybeSingle();
  return Boolean(data);
}

export async function createFinanceExpenseAction(formData: FormData) {
  const { session, access } = await requireFinancePermission("create");
  const admin = getSupabaseAdmin();
  const path = "/admin/finance/new";
  if (!admin) unavailable(path);

  const categoryId = String(formData.get("category_id") ?? "");
  const description = requiredText(formData.get("description"), 240);
  const supplierName = requiredText(formData.get("supplier_name"), 160);
  const incurredOn = String(formData.get("incurred_on") ?? "");
  const amountFils = parseAedToFils(formData.get("amount"));
  const vatInclusive = checked(formData, "vat_inclusive");
  const requestedStatus = formData.get("status") === "approved" ? "approved" : "draft";
  const paymentStatus = String(formData.get("payment_status") ?? "unpaid");
  const paymentMethod = String(formData.get("payment_method") ?? "");
  const paidOn = String(formData.get("paid_on") ?? "");
  const servicePeriodStart = String(formData.get("service_period_start") ?? "");
  const servicePeriodEnd = String(formData.get("service_period_end") ?? "");
  const recurringCostId = String(formData.get("recurring_cost_id") ?? "");

  if (!description || !isIsoDate(incurredOn) || amountFils === null) {
    fail(path, "Enter a valid date, description, and positive AED amount.");
  }
  if (!(await categoryBelongsToRestaurant(categoryId, session.restaurantId))) {
    fail(path, "Choose an active expense category.");
  }
  if (!supplierName && String(formData.get("supplier_name") ?? "").trim()) {
    fail(path, "Supplier names can be up to 160 characters.");
  }
  if (!["unpaid", "paid", "partial"].includes(paymentStatus)) {
    fail(path, "Choose a valid payment status.");
  }
  if (paymentMethod && !["cash", "card", "bank_transfer", "other"].includes(paymentMethod)) {
    fail(path, "Choose a valid payment method.");
  }
  if (paymentStatus === "paid" && !isIsoDate(paidOn)) {
    fail(path, "Paid expenses require a valid paid date.");
  }
  if (paidOn && !isIsoDate(paidOn)) fail(path, "Enter a valid paid date.");
  if ((servicePeriodStart || servicePeriodEnd) &&
      (!isIsoDate(servicePeriodStart) || !isIsoDate(servicePeriodEnd) || servicePeriodEnd < servicePeriodStart)) {
    fail(path, "Enter a valid service period, or leave both dates blank.");
  }
  if (recurringCostId && !(await recurringBelongsToRestaurant(recurringCostId, session.restaurantId))) {
    fail(path, "Choose an active recurring schedule.");
  }

  let subtotalFils: number;
  let inputVatFils: number;
  let totalFils: number;
  if (vatInclusive) {
    const split = splitInclusiveVat(amountFils);
    subtotalFils = split.subtotalFils;
    inputVatFils = split.vatFils;
    totalFils = split.totalFils;
  } else {
    const rawVat = String(formData.get("vat_amount") ?? "").trim();
    inputVatFils = rawVat ? (parseAedToFils(rawVat) ?? -1) : 0;
    if (inputVatFils < 0) fail(path, "Enter a valid VAT amount, or leave it blank.");
    subtotalFils = amountFils;
    totalFils = subtotalFils + inputVatFils;
  }

  const status = requestedStatus === "approved" && access.approve ? "approved" : "draft";
  const now = new Date().toISOString();
  const { error } = await admin.from("finance_expenses").insert({
    restaurant_id: session.restaurantId,
    category_id: categoryId,
    description,
    supplier_name: supplierName,
    incurred_on: incurredOn,
    subtotal_fils: subtotalFils,
    input_vat_fils: inputVatFils,
    total_fils: totalFils,
    vat_inclusive: vatInclusive,
    status,
    payment_status: paymentStatus,
    payment_method: paymentMethod || null,
    paid_on: paidOn || null,
    service_period_start: servicePeriodStart || null,
    service_period_end: servicePeriodEnd || null,
    recurring_cost_id: recurringCostId || null,
    created_by: session.userId,
    updated_by: session.userId,
    approved_by: status === "approved" ? session.userId : null,
    approved_at: status === "approved" ? now : null
  });
  if (error) fail(path, "The expense could not be saved. Check the fields and try again.");

  revalidatePath("/admin/finance");
  redirect(`/admin/finance?success=${encodeURIComponent(status === "approved" ? "Expense recorded." : "Expense draft saved.")}`);
}

export async function transitionFinanceExpenseAction(formData: FormData) {
  const { session } = await requireFinancePermission("approve");
  const admin = getSupabaseAdmin();
  if (!admin) unavailable("/admin/finance");
  const expenseId = String(formData.get("expense_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!expenseId || !["approved", "void"].includes(status)) {
    fail("/admin/finance", "Invalid expense status change.");
  }
  const fields = status === "approved"
    ? { status, approved_by: session.userId, approved_at: new Date().toISOString(), updated_by: session.userId }
    : { status, approved_by: null, approved_at: null, updated_by: session.userId };
  const { error, count } = await admin
    .from("finance_expenses")
    .update(fields, { count: "exact" })
    .eq("id", expenseId)
    .eq("restaurant_id", session.restaurantId)
    .neq("status", "void");
  if (error || count !== 1) fail("/admin/finance", "The expense could not be updated.");
  revalidatePath("/admin/finance");
  redirect(`/admin/finance?success=${encodeURIComponent(status === "approved" ? "Expense approved." : "Expense voided.")}`);
}

export async function createFinanceCategoryAction(formData: FormData) {
  const { session } = await requireFinancePermission("manage_categories");
  const admin = getSupabaseAdmin();
  if (!admin) unavailable("/admin/finance");
  const name = requiredText(formData.get("name"), 80);
  const classification = String(formData.get("classification") ?? "") as FinanceClassification;
  const allocationMonths = Number(formData.get("default_allocation_months"));
  if (!name || !FINANCE_CLASSIFICATIONS.includes(classification)) {
    fail("/admin/finance", "Enter a category name and classification.");
  }
  if (!Number.isInteger(allocationMonths) || allocationMonths < 1 || allocationMonths > 120) {
    fail("/admin/finance", "Allocation months must be between 1 and 120.");
  }
  const { error } = await admin.from("finance_categories").insert({
    restaurant_id: session.restaurantId,
    name,
    classification,
    default_allocation_months: allocationMonths,
    created_by: session.userId,
    updated_by: session.userId
  });
  if (error) fail("/admin/finance", "The category could not be saved. Names must be unique.");
  revalidatePath("/admin/finance");
  redirect(`/admin/finance?success=${encodeURIComponent("Category added.")}`);
}

export async function createFinanceRecurringCostAction(formData: FormData) {
  const { session } = await requireFinancePermission("manage_recurring");
  const admin = getSupabaseAdmin();
  const path = "/admin/finance/recurring";
  if (!admin) unavailable(path);
  const categoryId = String(formData.get("category_id") ?? "");
  const description = requiredText(formData.get("description"), 240);
  const amountFils = parseAedToFils(formData.get("amount"));
  const frequency = String(formData.get("frequency") ?? "") as FinanceFrequency;
  const allocationMonths = Number(formData.get("allocation_months"));
  const startOn = String(formData.get("start_on") ?? "");
  const endOn = String(formData.get("end_on") ?? "");
  const nextDueOn = String(formData.get("next_due_on") ?? "");
  if (!description || amountFils === null || !FINANCE_FREQUENCIES.includes(frequency)) {
    fail(path, "Enter a description, amount, and valid frequency.");
  }
  if (!(await categoryBelongsToRestaurant(categoryId, session.restaurantId))) {
    fail(path, "Choose an active expense category.");
  }
  if (!Number.isInteger(allocationMonths) || allocationMonths < 1 || allocationMonths > 120) {
    fail(path, "Allocation months must be between 1 and 120.");
  }
  if (!isIsoDate(startOn) || !isIsoDate(nextDueOn) || (endOn && !isIsoDate(endOn))) {
    fail(path, "Enter valid schedule dates.");
  }
  if (nextDueOn < startOn || (endOn && (endOn < startOn || nextDueOn > endOn))) {
    fail(path, "The recurring schedule dates are inconsistent.");
  }
  const { error } = await admin.from("finance_recurring_costs").insert({
    restaurant_id: session.restaurantId,
    category_id: categoryId,
    description,
    amount_fils: amountFils,
    frequency,
    allocation_months: allocationMonths,
    start_on: startOn,
    end_on: endOn || null,
    next_due_on: nextDueOn,
    created_by: session.userId,
    updated_by: session.userId
  });
  if (error) fail(path, "The recurring cost could not be saved.");
  revalidatePath(path);
  redirect(`${path}?success=${encodeURIComponent("Recurring cost added.")}`);
}

export async function toggleFinanceRecurringCostAction(formData: FormData) {
  const { session } = await requireFinancePermission("manage_recurring");
  const admin = getSupabaseAdmin();
  const path = "/admin/finance/recurring";
  if (!admin) unavailable(path);
  const recurringId = String(formData.get("recurring_id") ?? "");
  const isActive = formData.get("is_active") === "true";
  const { error, count } = await admin
    .from("finance_recurring_costs")
    .update({ is_active: isActive, updated_by: session.userId }, { count: "exact" })
    .eq("id", recurringId)
    .eq("restaurant_id", session.restaurantId);
  if (error || count !== 1) fail(path, "The recurring cost could not be updated.");
  revalidatePath(path);
  redirect(`${path}?success=${encodeURIComponent(isActive ? "Recurring cost resumed." : "Recurring cost paused.")}`);
}

export async function updateFinancePermissionsAction(formData: FormData) {
  const { session } = await requireFinancePermission("manage_permissions");
  const admin = getSupabaseAdmin();
  const path = "/admin/finance/settings";
  if (!admin) unavailable(path);
  const role = String(formData.get("role") ?? "");
  if (role !== "manager" && role !== "staff") fail(path, "Invalid finance role.");
  const canView = checked(formData, "can_view");
  const values = {
    restaurant_id: session.restaurantId,
    role,
    can_view: canView,
    can_create: checked(formData, "can_create"),
    can_approve: canView && checked(formData, "can_approve"),
    can_manage_categories: canView && checked(formData, "can_manage_categories"),
    can_manage_recurring: canView && checked(formData, "can_manage_recurring"),
    can_manage_costing: canView && checked(formData, "can_manage_costing"),
    can_view_reports: canView && checked(formData, "can_view_reports"),
    updated_by: session.userId
  };
  const { error } = await admin
    .from("finance_role_permissions")
    .upsert(values, { onConflict: "restaurant_id,role" });
  if (error) fail(path, "Finance permissions could not be updated.");
  revalidatePath(path);
  redirect(`${path}?success=${encodeURIComponent(`${role} permissions updated.`)}`);
}
