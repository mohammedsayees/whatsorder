import "server-only";

import { parseBusinessDayCloseReportSnapshot } from "@/lib/business-day";
import { getSupabaseAdmin } from "@/lib/supabase";
import { UNBILLED_SALE, unbilledFromEntries } from "@/lib/unbilled-sales";
import type { RestaurantAdminSession } from "@/lib/super-admin-auth";
import type { BusinessDay, ShiftOtherIncomeEntry } from "@/lib/types";

export async function getOtherIncomeForReport(
  restaurantId: string,
  startIso: string,
  endExclusiveIso: string
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("shift_other_income_entries")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .is("voided_at", null)
    .gte("recorded_at", startIso)
    .lt("recorded_at", endExclusiveIso)
    .order("recorded_at", { ascending: false });
  if (error) throw new Error("Other income report could not be loaded.");
  return (data ?? []) as ShiftOtherIncomeEntry[];
}

export async function getOpenBusinessDay(session: RestaurantAdminSession) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("business_days")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .eq("status", "open")
    .maybeSingle();
  if (error) throw new Error("Business day could not be loaded.");
  if (!data) return null;

  const { data: shifts, error: shiftsError } = await supabase
    .from("restaurant_shifts")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .eq("business_day_id", data.id)
    .order("opened_at", { ascending: true });
  if (shiftsError) throw new Error("Business day shifts could not be loaded.");

  return { day: data as BusinessDay, shifts: shifts ?? [] };
}

export async function getPreviousBusinessDays(
  session: RestaurantAdminSession,
  limit = 30
) {
  const supabase = getSupabaseAdmin();
  if (!supabase || session.role === "staff") return [];

  const { data, error } = await supabase
    .from("business_days")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .eq("status", "closed")
    .order("business_date", { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)));
  if (error) throw new Error("Previous business days could not be loaded.");
  return (data ?? []) as BusinessDay[];
}

export async function getBusinessDayReportView(
  session: RestaurantAdminSession,
  businessDayId: string
) {
  if (session.role === "staff") return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Business day report service is unavailable.");

  const { data, error } = await supabase
    .from("business_day_close_reports")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .eq("business_day_id", businessDayId)
    .order("version", { ascending: false });
  if (error) throw new Error("Business day report could not be loaded.");

  const reports = (data ?? []).map((row) => {
    const snapshot = parseBusinessDayCloseReportSnapshot(row.snapshot);
    if (!snapshot) throw new Error("A business day report contains invalid data.");
    return { ...row, snapshot };
  });
  return reports.length ? { reports } : null;
}

/**
 * Unbilled sales (by payment method) recorded in the given shifts of this
 * tenant. Day reports store only the category total, so the cash part is
 * read from the entries; voids after close are excluded, as in shift reports.
 */
export async function getUnbilledSalesForShifts(
  session: RestaurantAdminSession,
  shiftIds: string[]
) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !shiftIds.length) return unbilledFromEntries([]);
  const { data, error } = await supabase
    .from("shift_other_income_entries")
    .select("category, payment_method, amount, voided_at")
    .eq("restaurant_id", session.restaurantId)
    .eq("category", UNBILLED_SALE)
    .in("shift_id", shiftIds);
  if (error) throw new Error("Unbilled sales could not be loaded.");
  return unbilledFromEntries(
    (data ?? []).map((entry) => ({ ...entry, amount: Number(entry.amount) }))
  );
}
