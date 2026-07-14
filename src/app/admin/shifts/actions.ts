"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";

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
    "A closing note is required when cash has a difference"
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

  const { error } = await supabase.rpc("open_restaurant_shift", {
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

  if (!supabase) {
    return { error: "Shift service is unavailable." };
  }

  if (!shiftId || cashCounted === null || cashCounted < 0) {
    return { error: "Enter a valid counted cash amount." };
  }

  const { error } = await supabase.rpc("close_restaurant_shift", {
    event_actor_user_id: session.userId,
    requested_cash_counted_amount: cashCounted,
    requested_closing_note: closingNote || null,
    target_restaurant_id: session.restaurantId,
    target_shift_id: shiftId
  });

  if (error) {
    return { error: friendlyShiftError(error.message) };
  }

  refreshShiftViews();
  return { success: "Shift closed." };
}
