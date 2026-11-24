"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import { processFinanceExtractionJob } from "@/lib/finance-extraction";
import { paidOutLinkingAvailable } from "@/lib/finance-paid-out-data";
import { receiptAttachError } from "@/lib/finance-paid-outs";
import { FINANCE_DOCUMENT_BUCKET, inspectFinanceUpload } from "@/lib/finance-upload";
import {
  requireRestaurantAdmin,
  requireRestaurantRole
} from "@/lib/super-admin-auth";
import { parseCashDenominations } from "@/lib/cash-denominations";
import {
  configuredMarketplaceChannels,
  marketplaceSalesFromFormData
} from "@/lib/shift-reconciliation";

export type ShiftActionState = {
  error?: string;
  success?: string;
  /** Set when a paid-out looks like a duplicate; the form asks to confirm. */
  duplicateWarning?: string;
};

function formString(formData: FormData, key: string, maximumLength: number) {
  return String(formData.get(key) ?? "").trim().slice(0, maximumLength);
}

function moneyValue(formData: FormData, key: string) {
  const raw = String(formData.get(key) ?? "").trim();
  const value = Number(raw);
  return raw && Number.isFinite(value) ? value : null;
}

function friendlyShiftError(message?: string) {
  const knownMessages = [
    "This restaurant already has an open shift",
    "Opening cash cannot be negative",
    "Open shift not found",
    "Only the shift opener or restaurant management can add a paid-out",
    "Only the shift opener or restaurant management can close this shift",
    "Cannot close shift while active orders remain",
    "Settle rider cash before closing the shift",
    "Paid-out amount must be greater than zero",
    "A paid-out reason is required",
    "Counted cash cannot be negative",
    "Card terminal total cannot be negative",
    "UPI reported total cannot be negative",
    "Confirm every enabled marketplace before closing",
    "Enter valid marketplace totals or mark the report unavailable",
    "A closing note is required when reconciliation has a difference",
    "Only restaurant management can correct a closed shift report",
    "A correction reason is required and must be 500 characters or fewer",
    "Closed shift report not found",
    "A shift in a closed business day cannot be corrected",
    "Reconciliation totals cannot be negative",
    "Only the shift opener or restaurant management can add other income",
    "Choose a valid other income category",
    "Choose a valid other income payment method",
    "Other income amount must be greater than zero",
    "An other income description is required",
    "Other income can be voided only before shift close",
    "Only the shift opener or restaurant management can void other income",
    "A void reason is required",
    "Other income entry not found",
    "Only restaurant management can close a business day",
    "Open business day not found",
    "Close every shift before closing the business day",
    "The business day has no shifts",
    "Cannot close the business day while active orders remain",
    "Assign completed orders before closing the business day",
    "Only the shift opener or restaurant management can void a paid-out",
    "Only restaurant management can void a paid-out after shift close",
    "Paid-out not found or already voided",
    "This shift belongs to a closed business day and can no longer be corrected",
    "This shift has no close report to update",
    "Choose at least one order to assign",
    "Assign at most 200 orders at a time",
    "Only the shift opener or restaurant management can assign orders",
    "Some orders can no longer be assigned. Refresh and try again",
    "The cash count for this shift is already locked",
    "Close with the locked cash count",
    "Lock the cash count before closing",
    "Enter whole numbers of notes and coins",
    "The notes and coins do not add up to the counted cash",
    "Explain why opening cash differs from the last count",
    "An unbilled sale must be paid by cash, card or UPI"
  ];

  return (
    knownMessages.find((known) => message?.includes(known)) ??
    "The shift could not be updated. Refresh and try again."
  );
}

const countLockedMessage =
  "The cash count is locked, so paid-outs and other income can't be changed now. Ask a manager.";

/**
 * Once a blind count is locked the difference is visible, so a staff member
 * must not be able to change expected cash (e.g. add a paid-out to cover a
 * shortage). Managers can; their changes appear on the close report.
 */
async function staffCashCountLocked(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  session: Awaited<ReturnType<typeof requireRestaurantAdmin>>,
  shiftId: string
) {
  if (session.role !== "staff") {
    return false;
  }
  const { data } = await supabase
    .from("restaurant_shifts")
    .select("status,cash_count_declared_at")
    .eq("restaurant_id", session.restaurantId)
    .eq("id", shiftId)
    .maybeSingle();
  return data?.status === "open" && Boolean(data.cash_count_declared_at);
}

function refreshShiftViews() {
  revalidatePath("/admin/shifts");
}

export async function openShiftAction(
  _previousState: ShiftActionState,
  formData: FormData
): Promise<ShiftActionState> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();
  const shiftName = formString(formData, "shift_name", 80);
  const openingNote = formString(formData, "opening_note", 500);
  const openingCash = moneyValue(formData, "opening_cash_amount");
  const openingCashReason = formString(formData, "opening_cash_reason", 300);

  if (!supabase) {
    return { error: "Shift service is unavailable." };
  }

  if (!shiftName) {
    return { error: "Enter a shift name." };
  }

  if (openingCash === null || openingCash < 0) {
    return { error: "Enter a valid opening cash amount." };
  }

  const { error } = await supabase.rpc("open_restaurant_shift_v3", {
    event_actor_user_id: session.userId,
    requested_opening_cash_amount: openingCash,
    requested_opening_cash_reason: openingCashReason || null,
    requested_opening_note: openingNote || null,
    requested_shift_name: shiftName,
    target_restaurant_id: session.restaurantId
  });

  if (error) {
    return { error: friendlyShiftError(error.message) };
  }

  refreshShiftViews();
  return { success: "Shift opened." };
}

export async function addOtherIncomeAction(
  _previousState: ShiftActionState,
  formData: FormData
): Promise<ShiftActionState> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();
  const shiftId = formString(formData, "shift_id", 80);
  const category = formString(formData, "category", 40);
  const paymentMethod = formString(formData, "payment_method", 40);
  const description = formString(formData, "description", 300);
  const reference = formString(formData, "reference", 120);
  const amount = moneyValue(formData, "amount");

  if (!supabase) return { error: "Shift service is unavailable." };
  if (!shiftId || !category || !paymentMethod || !description || amount === null || amount <= 0) {
    return { error: "Enter the income category, payment method, amount and description." };
  }

  if (await staffCashCountLocked(supabase, session, shiftId)) {
    return { error: countLockedMessage };
  }

  const { error } = await supabase.rpc("add_shift_other_income", {
    event_actor_user_id: session.userId,
    requested_amount: amount,
    requested_category: category,
    requested_description: description,
    requested_payment_method: paymentMethod,
    requested_reference: reference || null,
    target_restaurant_id: session.restaurantId,
    target_shift_id: shiftId
  });
  if (error) return { error: friendlyShiftError(error.message) };
  refreshShiftViews();
  return {
    success: category === "unbilled_sale" ? "Unbilled sale recorded." : "Other income recorded."
  };
}

export async function voidOtherIncomeAction(
  _previousState: ShiftActionState,
  formData: FormData
): Promise<ShiftActionState> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();
  const shiftId = formString(formData, "shift_id", 80);
  const entryId = formString(formData, "entry_id", 80);
  const reason = formString(formData, "reason", 300);
  if (!supabase) return { error: "Shift service is unavailable." };
  if (!shiftId || !entryId || !reason) return { error: "Enter a reason for voiding this entry." };

  if (await staffCashCountLocked(supabase, session, shiftId)) {
    return { error: countLockedMessage };
  }

  const { error } = await supabase.rpc("void_shift_other_income", {
    event_actor_user_id: session.userId,
    requested_reason: reason,
    target_entry_id: entryId,
    target_restaurant_id: session.restaurantId,
    target_shift_id: shiftId
  });
  if (error) return { error: friendlyShiftError(error.message) };
  refreshShiftViews();
  return { success: "Other income entry voided. Its audit record was retained." };
}

export async function addShiftPaidOutAction(
  _previousState: ShiftActionState,
  formData: FormData
): Promise<ShiftActionState> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();
  const shiftId = formString(formData, "shift_id", 80);
  const reason = formString(formData, "reason", 300);
  const amount = moneyValue(formData, "amount");

  if (!supabase) {
    return { error: "Shift service is unavailable." };
  }

  if (!shiftId || amount === null || amount <= 0 || !reason) {
    return { error: "Enter a paid-out amount and reason." };
  }

  if (await staffCashCountLocked(supabase, session, shiftId)) {
    return { error: countLockedMessage };
  }

  // The same bill entered twice inflates paid-outs and makes the drawer look
  // over at close. Ask before saving a second paid-out of the same amount.
  if (formData.get("confirm_duplicate") !== "on") {
    const { data: sameAmount } = await supabase
      .from("shift_cash_paid_outs")
      .select("reason,recorded_at")
      .eq("restaurant_id", session.restaurantId)
      .eq("shift_id", shiftId)
      .eq("amount", amount)
      .is("voided_at", null)
      .order("recorded_at", { ascending: false })
      .limit(1);
    const existing = sameAmount?.[0];
    if (existing) {
      return {
        duplicateWarning: `A paid-out of the same amount is already recorded on this shift ("${String(existing.reason).slice(0, 80)}"). Is this a different payment?`
      };
    }
  }

  const { error } = await supabase.rpc("add_shift_cash_paid_out", {
    event_actor_user_id: session.userId,
    requested_amount: amount,
    requested_reason: reason,
    target_restaurant_id: session.restaurantId,
    target_shift_id: shiftId
  });

  if (error) {
    return { error: friendlyShiftError(error.message) };
  }

  refreshShiftViews();
  return { success: "Cash paid-out recorded." };
}

export async function voidShiftPaidOutAction(
  _previousState: ShiftActionState,
  formData: FormData
): Promise<ShiftActionState> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();
  const paidOutId = formString(formData, "paid_out_id", 80);
  const shiftId = formString(formData, "shift_id", 80);
  const reason = formString(formData, "reason", 300);
  if (!supabase) return { error: "Shift service is unavailable." };
  if (!paidOutId || !reason) return { error: "Enter a reason for voiding this paid-out." };

  // The paid-out row, not the form, says which shift it belongs to.
  const { data: paidOutRow } = await supabase
    .from("shift_cash_paid_outs")
    .select("shift_id")
    .eq("restaurant_id", session.restaurantId)
    .eq("id", paidOutId)
    .maybeSingle();
  if (paidOutRow?.shift_id &&
      await staffCashCountLocked(supabase, session, String(paidOutRow.shift_id))) {
    return { error: countLockedMessage };
  }

  const { data: reportVersion, error } = await supabase.rpc("void_shift_cash_paid_out", {
    event_actor_user_id: session.userId,
    requested_reason: reason,
    target_paid_out_id: paidOutId,
    target_restaurant_id: session.restaurantId
  });
  if (error) return { error: friendlyShiftError(error.message) };
  refreshShiftViews();
  if (shiftId) revalidatePath(`/admin/shifts/${shiftId}/report`);
  revalidatePath("/admin/finance/paid-outs");
  return {
    success: typeof reportVersion === "number"
      ? `Paid-out voided. Shift report updated to version ${reportVersion}.`
      : "Paid-out voided. Expected cash has been updated."
  };
}

// Attach a receipt photo/PDF to a paid-out on the open shift. The uploader only
// learns that the receipt was attached; what is read from it is Finance-only.
export async function attachPaidOutReceiptAction(
  _previousState: ShiftActionState,
  formData: FormData
): Promise<ShiftActionState> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();
  const paidOutId = formString(formData, "paid_out_id", 80);
  const file = formData.get("receipt");
  if (!supabase) return { error: "Shift service is unavailable." };
  if (!/^[0-9a-f-]{36}$/i.test(paidOutId)) return { error: "Choose a paid-out." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a receipt photo or PDF." };
  if (!(await paidOutLinkingAvailable(session))) return { error: "Receipts aren't available for this restaurant." };

  const { data: allowed, error: rateError } = await supabase.rpc("check_finance_scan_rate_limit", {
    target_restaurant_id: session.restaurantId,
    target_user_id: session.userId
  });
  if (rateError) return { error: "The upload limit could not be checked. Try again." };
  if (allowed !== true) return { error: "Too many uploads. Wait a few minutes and try again." };

  let inspected;
  try {
    inspected = await inspectFinanceUpload(file);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "That file could not be opened." };
  }

  const documentId = randomUUID();
  const storagePath = `${session.restaurantId}/${documentId}.${inspected.extension}`;
  const { error: uploadError } = await supabase.storage
    .from(FINANCE_DOCUMENT_BUCKET)
    .upload(storagePath, inspected.bytes, { contentType: inspected.contentType, upsert: false });
  if (uploadError) return { error: "The receipt upload failed. Try again." };

  const { error } = await supabase.rpc("create_paid_out_receipt_job", {
    target_restaurant_id: session.restaurantId,
    target_paid_out_id: paidOutId,
    requested_document_id: documentId,
    requested_storage_path: storagePath,
    requested_original_name: inspected.originalName,
    requested_mime_type: inspected.contentType,
    requested_byte_size: inspected.originalByteSize,
    requested_page_count: inspected.pageCount,
    requested_file_hash: inspected.originalHash,
    event_actor_user_id: session.userId
  });
  if (error) {
    await supabase.storage.from(FINANCE_DOCUMENT_BUCKET).remove([storagePath]);
    return { error: receiptAttachError(error.message) };
  }

  // Read the receipt in the background, within this request's maxDuration.
  after(async () => {
    await processFinanceExtractionJob(session.restaurantId, documentId, {
      bytes: inspected.bytes,
      mimeType: inspected.contentType
    });
  });
  refreshShiftViews();
  revalidatePath("/admin/finance");
  revalidatePath("/admin/finance/paid-outs");
  return { success: "Receipt attached. Finance will review it." };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function assignUnassignedOrdersAction(
  _previousState: ShiftActionState,
  formData: FormData
): Promise<ShiftActionState> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();
  const shiftId = formString(formData, "shift_id", 80);
  const orderIds = [...new Set(
    formData.getAll("order_id").map((value) => String(value).trim())
  )].filter((value) => uuidPattern.test(value));

  if (!supabase) {
    return { error: "Shift service is unavailable." };
  }

  if (!uuidPattern.test(shiftId)) {
    return { error: "No open shift found. Open a shift first." };
  }

  if (orderIds.length === 0) {
    return { error: "Choose at least one order to assign." };
  }

  if (orderIds.length > 200) {
    return { error: "Assign at most 200 orders at a time." };
  }

  const { data: assigned, error } = await supabase.rpc(
    "assign_unassigned_orders_to_open_shift",
    {
      event_actor_user_id: session.userId,
      target_order_ids: orderIds,
      target_restaurant_id: session.restaurantId,
      target_shift_id: shiftId
    }
  );

  if (error) {
    return { error: friendlyShiftError(error.message) };
  }

  refreshShiftViews();
  const count = typeof assigned === "number" ? assigned : orderIds.length;
  return {
    success: `${count} order${count === 1 ? "" : "s"} moved to the current shift.`
  };
}

// Blind count, step 1: lock the counted cash before expected cash is shown.
export async function declareCashCountAction(
  _previousState: ShiftActionState,
  formData: FormData
): Promise<ShiftActionState> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();
  const shiftId = formString(formData, "shift_id", 80);
  const cashCounted = moneyValue(formData, "cash_counted_amount");

  if (!supabase) {
    return { error: "Shift service is unavailable." };
  }

  if (!shiftId || cashCounted === null || cashCounted < 0 || cashCounted > 99_999_999.99) {
    return { error: "Enter a valid counted cash amount." };
  }

  if (formData.get("confirm_count") !== "on") {
    return { error: "Confirm you have counted the whole drawer." };
  }

  const breakdown = parseCashDenominations(
    formData.get("cash_denominations"),
    session.restaurant.currency_code,
    cashCounted
  );
  if (breakdown.error) {
    return { error: breakdown.error };
  }

  const { error } = await supabase.rpc("declare_shift_cash_count", {
    event_actor_user_id: session.userId,
    requested_cash_counted_amount: cashCounted,
    // Sent only when used, so calls also match the pre-breakdown signature.
    ...(breakdown.denominations ? { requested_cash_denominations: breakdown.denominations } : {}),
    target_restaurant_id: session.restaurantId,
    target_shift_id: shiftId
  });

  if (error) {
    return { error: friendlyShiftError(error.message) };
  }

  refreshShiftViews();
  revalidatePath("/admin/orders");
  return { success: "Cash count locked." };
}

export async function closeShiftAction(
  _previousState: ShiftActionState,
  formData: FormData
): Promise<ShiftActionState> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();
  const shiftId = formString(formData, "shift_id", 80);
  const closingNote = formString(formData, "closing_note", 500);
  const cashCounted = moneyValue(formData, "cash_counted_amount");
  const cardTerminalTotal = moneyValue(formData, "card_terminal_total");
  const upiReportedTotal = moneyValue(formData, "upi_reported_total");
  const marketplaceResult = marketplaceSalesFromFormData(
    formData,
    configuredMarketplaceChannels(session.restaurant.shift_marketplace_channels)
  );

  if (!supabase) {
    return { error: "Shift service is unavailable." };
  }

  if (!shiftId || cashCounted === null || cashCounted < 0) {
    return { error: "Enter a valid counted cash amount." };
  }

  if (cardTerminalTotal === null || cardTerminalTotal < 0) {
    return { error: "Enter a valid card terminal total." };
  }

  if (
    session.restaurant.country_code === "IN" &&
    (upiReportedTotal === null || upiReportedTotal < 0)
  ) {
    return { error: "Enter a valid UPI reported total." };
  }

  if (marketplaceResult.error || !marketplaceResult.entries) {
    return { error: marketplaceResult.error ?? "Confirm every marketplace total." };
  }

  const breakdown = parseCashDenominations(
    formData.get("cash_denominations"),
    session.restaurant.currency_code,
    cashCounted
  );
  if (breakdown.error) {
    return { error: breakdown.error };
  }

  const { error } = await supabase.rpc("close_restaurant_shift_v5", {
    event_actor_user_id: session.userId,
    requested_card_terminal_total: cardTerminalTotal,
    requested_cash_counted_amount: cashCounted,
    // Sent only when used, so calls also match the pre-breakdown signature.
    ...(breakdown.denominations ? { requested_cash_denominations: breakdown.denominations } : {}),
    requested_closing_note: closingNote || null,
    requested_marketplace_sales: marketplaceResult.entries,
    requested_upi_reported_total:
      session.restaurant.country_code === "IN" ? upiReportedTotal : null,
    target_restaurant_id: session.restaurantId,
    target_shift_id: shiftId
  });

  if (error) {
    return { error: friendlyShiftError(error.message) };
  }

  refreshShiftViews();
  redirect(`/admin/shifts/${shiftId}/report?print=thermal`);
}

export async function reviseShiftReportAction(
  _previousState: ShiftActionState,
  formData: FormData
): Promise<ShiftActionState> {
  const session = await requireRestaurantRole([
    "restaurant_admin",
    "owner",
    "manager"
  ]);
  const supabase = getSupabaseAdmin();
  const shiftId = formString(formData, "shift_id", 80);
  const correctionReason = formString(formData, "correction_reason", 500);
  const cashCounted = moneyValue(formData, "cash_counted_amount");
  const cardTerminalTotal = moneyValue(formData, "card_terminal_total");
  const upiReportedTotal = moneyValue(formData, "upi_reported_total");
  const reportChannels = configuredMarketplaceChannels(
    formData.getAll("report_marketplace_channel")
  );
  const marketplaceResult = marketplaceSalesFromFormData(formData, reportChannels);

  if (!supabase) {
    return { error: "Shift service is unavailable." };
  }

  if (!shiftId || !correctionReason) {
    return { error: "Enter a correction reason." };
  }

  if (cashCounted === null || cashCounted < 0 ||
      cardTerminalTotal === null || cardTerminalTotal < 0) {
    return { error: "Enter valid reconciliation totals." };
  }

  if (session.restaurant.country_code === "IN" &&
      (upiReportedTotal === null || upiReportedTotal < 0)) {
    return { error: "Enter a valid UPI reported total." };
  }

  if (marketplaceResult.error || !marketplaceResult.entries) {
    return { error: marketplaceResult.error ?? "Confirm every marketplace total." };
  }

  const { error } = await supabase.rpc("revise_restaurant_shift_close_report_v2", {
    event_actor_user_id: session.userId,
    requested_card_terminal_total: cardTerminalTotal,
    requested_cash_counted_amount: cashCounted,
    requested_correction_reason: correctionReason,
    requested_marketplace_sales: marketplaceResult.entries,
    requested_upi_reported_total:
      session.restaurant.country_code === "IN" ? upiReportedTotal : null,
    target_restaurant_id: session.restaurantId,
    target_shift_id: shiftId
  });

  if (error) {
    return { error: friendlyShiftError(error.message) };
  }

  revalidatePath(`/admin/shifts/${shiftId}/report`);
  revalidatePath("/admin/shifts");
  return { success: "Correction saved as a new report version." };
}

export async function closeBusinessDayAction(
  _previousState: ShiftActionState,
  formData: FormData
): Promise<ShiftActionState> {
  const session = await requireRestaurantRole([
    "restaurant_admin", "owner", "manager"
  ]);
  const supabase = getSupabaseAdmin();
  const businessDayId = formString(formData, "business_day_id", 80);
  if (!supabase) return { error: "Business day service is unavailable." };
  if (!businessDayId) return { error: "Business day is missing." };

  const { error } = await supabase.rpc("close_business_day", {
    event_actor_user_id: session.userId,
    target_business_day_id: businessDayId,
    target_restaurant_id: session.restaurantId
  });
  if (error) return { error: friendlyShiftError(error.message) };

  revalidatePath("/admin/shifts");
  redirect(`/admin/business-days/${businessDayId}/report`);
}
