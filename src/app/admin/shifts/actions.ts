"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  requireRestaurantAdmin,
  requireRestaurantRole
} from "@/lib/super-admin-auth";
import {
  configuredMarketplaceChannels,
  marketplaceSalesFromFormData
} from "@/lib/shift-reconciliation";

export type ShiftActionState = {
  error?: string;
  success?: string;
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
    "Assign completed orders before closing the business day"
  ];

  return (
    knownMessages.find((known) => message?.includes(known)) ??
    "The shift could not be updated. Refresh and try again."
  );
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

  if (!supabase) {
    return { error: "Shift service is unavailable." };
  }

  if (!shiftName) {
    return { error: "Enter a shift name." };
  }

  if (openingCash === null || openingCash < 0) {
    return { error: "Enter a valid opening cash amount." };
  }

  const { error } = await supabase.rpc("open_restaurant_shift_v2", {
    event_actor_user_id: session.userId,
    requested_opening_cash_amount: openingCash,
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
  return { success: "Other income recorded." };
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

export async function assignUnassignedOrdersAction(
  _previousState: ShiftActionState,
  _formData: FormData
): Promise<ShiftActionState> {
  const session = await requireRestaurantAdmin();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return { error: "Shift service is unavailable." };
  }

  const { data: openShift } = await supabase
    .from("restaurant_shifts")
    .select("id")
    .eq("restaurant_id", session.restaurantId)
    .eq("status", "open")
    .maybeSingle();

  if (!openShift) {
    return { error: "No open shift found. Open a shift first." };
  }

  const { error } = await supabase
    .from("orders")
    .update({ shift_id: openShift.id })
    .eq("restaurant_id", session.restaurantId)
    .eq("status", "Completed")
    .is("shift_id", null);

  if (error) {
    return { error: "Could not reassign orders. Try again." };
  }

  refreshShiftViews();
  return { success: "Unassigned orders moved to the current shift." };
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

  const { error } = await supabase.rpc("close_restaurant_shift_v3", {
    event_actor_user_id: session.userId,
    requested_card_terminal_total: cardTerminalTotal,
    requested_cash_counted_amount: cashCounted,
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
