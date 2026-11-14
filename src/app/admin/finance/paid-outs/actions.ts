"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requiredText } from "@/lib/finance";
import { requireFinancePermission } from "@/lib/finance-data";
import { paidOutLinkingAvailable } from "@/lib/finance-paid-out-data";
import { getSupabaseAdmin } from "@/lib/supabase";

const PATH = "/admin/finance/paid-outs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string): never {
  redirect(`${PATH}?error=${encodeURIComponent(message)}`);
}

function done(message: string): never {
  revalidatePath(PATH);
  revalidatePath("/admin/finance");
  revalidatePath("/admin/shifts");
  redirect(`${PATH}?success=${encodeURIComponent(message)}`);
}

function uuidField(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  return UUID.test(value) ? value : null;
}

// Map database guard messages to staff-friendly text; never echo raw errors.
function friendlyError(message: string | undefined) {
  const text = message ?? "";
  if (text.includes("Amounts differ")) return "The amounts differ. Tick the confirmation and give a reason.";
  if (text.includes("already linked or dismissed")) return "This paid-out already has a bill or was dismissed.";
  if (text.includes("already linked to another paid-out")) return "That expense is already linked to another paid-out.";
  if (text.includes("Expense not found")) return "That expense is no longer available.";
  if (text.includes("Invalid finance category")) return "Choose an active expense category.";
  if (text.includes("only available for AED")) return "Paid-out linking is only available for AED restaurants.";
  return "The change could not be saved. Try again.";
}

async function guard() {
  const { session } = await requireFinancePermission("approve");
  if (!(await paidOutLinkingAvailable(session))) fail("Paid-out linking is not available for this restaurant.");
  const admin = getSupabaseAdmin();
  if (!admin) fail("Finance is unavailable. Try again later.");
  return { session, admin };
}

export async function linkPaidOutToExpenseAction(formData: FormData) {
  const { session, admin } = await guard();
  const paidOutId = uuidField(formData, "paid_out_id");
  const expenseId = uuidField(formData, "expense_id");
  if (!paidOutId || !expenseId) fail("Choose the expense to link.");
  const rawReason = String(formData.get("mismatch_reason") ?? "").trim();
  if (rawReason.length > 300) fail("The mismatch reason can be up to 300 characters.");
  const { error } = await admin.rpc("link_finance_paid_out_to_expense", {
    target_restaurant_id: session.restaurantId,
    target_paid_out_id: paidOutId,
    target_expense_id: expenseId,
    confirm_mismatch: formData.get("confirm_mismatch") === "on",
    requested_mismatch_reason: rawReason || null,
    event_actor_user_id: session.userId
  });
  if (error) fail(friendlyError(error.message));
  done("Paid-out linked to the bill.");
}

export async function convertPaidOutToExpenseAction(formData: FormData) {
  const { session, admin } = await guard();
  const paidOutId = uuidField(formData, "paid_out_id");
  const categoryId = uuidField(formData, "category_id");
  if (!paidOutId || !categoryId) fail("Choose an expense category.");
  const rawDescription = String(formData.get("description") ?? "").trim();
  const rawSupplier = String(formData.get("supplier_name") ?? "").trim();
  const description = rawDescription ? requiredText(rawDescription, 240) : null;
  const supplier = rawSupplier ? requiredText(rawSupplier, 160) : null;
  if (rawDescription && !description) fail("Descriptions can be up to 240 characters.");
  if (rawSupplier && !supplier) fail("Supplier names can be up to 160 characters.");
  const { error } = await admin.rpc("convert_finance_paid_out_to_expense", {
    target_restaurant_id: session.restaurantId,
    target_paid_out_id: paidOutId,
    requested_category_id: categoryId,
    requested_description: description,
    requested_supplier_name: supplier,
    event_actor_user_id: session.userId
  });
  if (error) fail(friendlyError(error.message));
  done("Paid-out recorded as a cash expense.");
}

export async function dismissPaidOutAction(formData: FormData) {
  const { session, admin } = await guard();
  const paidOutId = uuidField(formData, "paid_out_id");
  const reason = requiredText(formData.get("reason"), 300);
  if (!paidOutId || !reason) fail("Give a reason (up to 300 characters) for marking this as not an expense.");
  const { error } = await admin.rpc("dismiss_finance_paid_out", {
    target_restaurant_id: session.restaurantId,
    target_paid_out_id: paidOutId,
    requested_reason: reason,
    event_actor_user_id: session.userId
  });
  if (error) fail(friendlyError(error.message));
  done("Paid-out marked as not an expense.");
}

export async function unlinkPaidOutAction(formData: FormData) {
  const { session, admin } = await guard();
  const linkId = uuidField(formData, "link_id");
  const reason = requiredText(formData.get("reason"), 300);
  if (!linkId || !reason) fail("Give a reason (up to 300 characters) for undoing this.");
  const { data, error } = await admin.rpc("unlink_finance_paid_out", {
    target_restaurant_id: session.restaurantId,
    target_link_id: linkId,
    requested_reason: reason,
    event_actor_user_id: session.userId
  });
  if (error || data !== true) fail("That link could not be undone.");
  done("Undone. The paid-out is back in the list without a bill.");
}
