import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import type {
  RestaurantAdminSession
} from "@/lib/super-admin-auth";
import type {
  RestaurantShift,
  ShiftCashPaidOut,
  ShiftCloseReport,
  ShiftSummary
} from "@/lib/types";
import { parseShiftCloseReportSnapshot } from "@/lib/shift-reconciliation";

export type CurrentShiftView = {
  activeOrderCount: number;
  canManage: boolean;
  paidOuts: ShiftCashPaidOut[];
  shift: RestaurantShift;
  summary: ShiftSummary;
};

const emptySummary: ShiftSummary = {
  cancelled_order_count: 0,
  card_on_delivery_total: 0,
  upi_total: 0,
  cash_paid_out_total: 0,
  completed_cash_order_total: 0,
  completed_order_count: 0,
  completed_sales: 0,
  expected_cash_amount: 0,
  fulfilment_breakdown: {}
};

const activeOrderStatuses = [
  "New",
  "Accepted",
  "Preparing",
  "Ready to Serve",
  "Out for Delivery"
] as const;

function numericSummary(value: unknown) {
  const summary = (value ?? {}) as Partial<ShiftSummary>;

  return {
    cancelled_order_count: Number(summary.cancelled_order_count ?? 0),
    card_on_delivery_total: Number(summary.card_on_delivery_total ?? 0),
    upi_total: Number(summary.upi_total ?? 0),
    cash_paid_out_total: Number(summary.cash_paid_out_total ?? 0),
    completed_cash_order_total: Number(
      summary.completed_cash_order_total ?? 0
    ),
    completed_order_count: Number(summary.completed_order_count ?? 0),
    completed_sales: Number(summary.completed_sales ?? 0),
    expected_cash_amount: Number(summary.expected_cash_amount ?? 0),
    fulfilment_breakdown: summary.fulfilment_breakdown ?? {}
  } satisfies ShiftSummary;
}

export async function getCurrentShiftView(
  session: RestaurantAdminSession
): Promise<CurrentShiftView | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return null;
  }

  const { data: shift, error: shiftError } = await supabase
    .from("restaurant_shifts")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .eq("status", "open")
    .maybeSingle();

  if (shiftError) {
    throw new Error("Current shift could not be loaded.");
  }

  if (!shift) {
    return null;
  }

  const [
    { data: summary, error: summaryError },
    { data: paidOuts, error: paidOutError },
    { count: activeOrderCount, error: activeOrderError }
  ] =
    await Promise.all([
      supabase.rpc("calculate_restaurant_shift_summary", {
        target_restaurant_id: session.restaurantId,
        target_shift_id: shift.id
      }),
      supabase
        .from("shift_cash_paid_outs")
        .select("*")
        .eq("restaurant_id", session.restaurantId)
        .eq("shift_id", shift.id)
        .order("recorded_at", { ascending: false })
        .limit(100),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", session.restaurantId)
        .in("status", [...activeOrderStatuses])
    ]);

  if (summaryError || paidOutError || activeOrderError) {
    throw new Error("Current shift totals could not be loaded.");
  }

  return {
    activeOrderCount: activeOrderCount ?? 0,
    canManage:
      session.role !== "staff" || shift.opened_by_user_id === session.userId,
    paidOuts: (paidOuts ?? []) as ShiftCashPaidOut[],
    shift: shift as RestaurantShift,
    summary: summary ? numericSummary(summary) : emptySummary
  };
}

export async function getPreviousShifts(
  session: RestaurantAdminSession,
  limit = 50
) {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return [];
  }

  let query = supabase
    .from("restaurant_shifts")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .eq("status", "closed")
    .order("opened_at", { ascending: false })
    .limit(Math.min(100, Math.max(1, limit)));

  if (session.role === "staff") {
    query = query.eq("opened_by_user_id", session.userId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("Previous shifts could not be loaded.");
  }

  return (data ?? []) as RestaurantShift[];
}

export async function getUnassignedCompletedOrderCount(restaurantId: string) {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return 0;
  }

  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", restaurantId)
    .eq("status", "Completed")
    .is("shift_id", null);

  if (error) {
    throw new Error("Unassigned completed orders could not be counted.");
  }

  return count ?? 0;
}

export async function getShiftCloseReportView(
  session: RestaurantAdminSession,
  shiftId: string
) {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    throw new Error("Shift report service is unavailable.");
  }

  const { data: shift, error: shiftError } = await supabase
    .from("restaurant_shifts")
    .select("id,restaurant_id,status,opened_by_user_id,close_report_version")
    .eq("id", shiftId)
    .eq("restaurant_id", session.restaurantId)
    .eq("status", "closed")
    .maybeSingle();

  if (shiftError) {
    throw new Error("Shift report could not be loaded.");
  }

  if (!shift ||
      (session.role === "staff" && shift.opened_by_user_id !== session.userId)) {
    return null;
  }

  const { data, error } = await supabase
    .from("shift_close_reports")
    .select("*")
    .eq("restaurant_id", session.restaurantId)
    .eq("shift_id", shiftId)
    .order("version", { ascending: false });

  if (error) {
    throw new Error("Shift report versions could not be loaded.");
  }

  const reports = (data ?? []).map((row) => {
    const snapshot = parseShiftCloseReportSnapshot(row.snapshot);
    if (!snapshot) {
      throw new Error("A shift report contains invalid data.");
    }

    return {
      ...row,
      snapshot
    } as ShiftCloseReport;
  });

  return {
    canCorrect: session.role !== "staff",
    currentVersion: Number(shift.close_report_version ?? 0),
    reports
  };
}
