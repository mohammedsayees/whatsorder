import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import type {
  RestaurantAdminSession
} from "@/lib/super-admin-auth";
import type {
  RestaurantShift,
  ShiftCashPaidOut,
  ShiftCloseReport,
  ShiftOtherIncomeEntry,
  ShiftSummary
} from "@/lib/types";
import { parseShiftCloseReportSnapshot } from "@/lib/shift-reconciliation";

export type CurrentShiftView = {
  activeOrderCount: number;
  canManage: boolean;
  /**
   * Blind count in progress: a staff member must lock their cash count first.
   * Cash figures that reveal expected cash are zeroed in `summary`, so they
   * never reach the browser; UIs must hide them while this is true.
   */
  cashBlind: boolean;
  /** Locked counted cash, once declared. */
  declaredCash: number | null;
  paidOuts: ShiftCashPaidOut[];
  otherIncomeEntries: ShiftOtherIncomeEntry[];
  shift: RestaurantShift;
  summary: ShiftSummary;
};

const emptySummary: ShiftSummary = {
  cancelled_order_count: 0,
  card_on_delivery_total: 0,
  upi_total: 0,
  cash_paid_out_total: 0,
  other_income_total: 0,
  cash_other_income_total: 0,
  card_other_income_total: 0,
  upi_other_income_total: 0,
  bank_other_income_total: 0,
  other_income_breakdown: {},
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
    other_income_total: Number(summary.other_income_total ?? 0),
    cash_other_income_total: Number(summary.cash_other_income_total ?? 0),
    card_other_income_total: Number(summary.card_other_income_total ?? 0),
    upi_other_income_total: Number(summary.upi_other_income_total ?? 0),
    bank_other_income_total: Number(summary.bank_other_income_total ?? 0),
    other_income_breakdown: summary.other_income_breakdown ?? {},
    completed_cash_order_total: Number(
      summary.completed_cash_order_total ?? 0
    ),
    completed_order_count: Number(summary.completed_order_count ?? 0),
    completed_sales: Number(summary.completed_sales ?? 0),
    expected_cash_amount: Number(summary.expected_cash_amount ?? 0),
    fulfilment_breakdown: summary.fulfilment_breakdown ?? {}
  } satisfies ShiftSummary;
}

/** Staff of a blind-count restaurant don't see expected cash until they lock a count. */
export function isCashCountBlind(
  session: Pick<RestaurantAdminSession, "role" | "restaurant">,
  countDeclared: boolean
) {
  return session.role === "staff" &&
    session.restaurant.blind_cash_count !== false &&
    !countDeclared;
}

/** Removes the figures from which expected cash could be worked out. */
export function blindSummary(summary: ShiftSummary): ShiftSummary {
  return {
    ...summary,
    completed_cash_order_total: 0,
    completed_sales: 0,
    expected_cash_amount: 0,
    fulfilment_breakdown: {}
  };
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
    { count: activeOrderCount, error: activeOrderError },
    { data: otherIncomeEntries, error: otherIncomeError }
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
        .in("status", [...activeOrderStatuses]),
      supabase
        .from("shift_other_income_entries")
        .select("*")
        .eq("restaurant_id", session.restaurantId)
        .eq("shift_id", shift.id)
        .is("voided_at", null)
        .order("recorded_at", { ascending: false })
        .limit(100)
    ]);

  if (summaryError || paidOutError || activeOrderError || otherIncomeError) {
    throw new Error("Current shift totals could not be loaded.");
  }

  const declaredCash = shift.cash_count_declared_at
    ? Number(shift.declared_cash_counted_amount)
    : null;
  const cashBlind = isCashCountBlind(session, declaredCash !== null);
  const fullSummary = summary ? numericSummary(summary) : emptySummary;

  return {
    activeOrderCount: activeOrderCount ?? 0,
    canManage:
      session.role !== "staff" || shift.opened_by_user_id === session.userId,
    cashBlind,
    declaredCash,
    paidOuts: (paidOuts ?? []) as ShiftCashPaidOut[],
    otherIncomeEntries: (otherIncomeEntries ?? []) as ShiftOtherIncomeEntry[],
    shift: shift as RestaurantShift,
    summary: cashBlind ? blindSummary(fullSummary) : fullSummary
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

export type UnassignedCompletedOrder = {
  id: string;
  total: number;
  payment_method: string | null;
  fulfilment_type: string;
  completed_at: string;
};

export type UnassignedCompletedOrders = {
  /** Completed with no shift open, inside the current business-day window. */
  assignable: UnassignedCompletedOrder[];
  /** Older ones belong to a closed day; they are never moved into a live drawer. */
  olderCount: number;
};

const unassignedOrderLimit = 200;

export async function getUnassignedCompletedOrders(
  restaurantId: string
): Promise<UnassignedCompletedOrders> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return { assignable: [], olderCount: 0 };
  }

  const { data: windowStart, error: windowError } = await supabase.rpc(
    "unassigned_shift_order_window_start",
    { target_restaurant_id: restaurantId }
  );

  if (windowError || typeof windowStart !== "string") {
    throw new Error("Unassigned completed orders could not be loaded.");
  }

  const { data, error } = await supabase
    .from("orders")
    .select("id,total,payment_method,fulfilment_type,created_at,closed_at")
    .eq("restaurant_id", restaurantId)
    .eq("status", "Completed")
    .is("shift_id", null)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error("Unassigned completed orders could not be loaded.");
  }

  const windowStartMs = Date.parse(windowStart);
  const assignable: UnassignedCompletedOrder[] = [];
  let olderCount = 0;

  for (const order of data ?? []) {
    const completedAt = String(order.closed_at ?? order.created_at);
    if (Date.parse(completedAt) >= windowStartMs) {
      assignable.push({
        id: String(order.id),
        total: Number(order.total ?? 0),
        payment_method: order.payment_method ? String(order.payment_method) : null,
        fulfilment_type: String(order.fulfilment_type),
        completed_at: completedAt
      });
    } else {
      olderCount += 1;
    }
  }

  assignable.sort((a, b) => Date.parse(a.completed_at) - Date.parse(b.completed_at));
  return { assignable: assignable.slice(0, unassignedOrderLimit), olderCount };
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


export type LateShiftReceipt = { id: string; shift_id: string; total: number;
  payment_method: string; created_at: string; punched_at: string | null;
  /** Report version that includes this receipt, or null if it is still only an addendum. */
  included_in_report_version: number | null };

export async function getLateShiftReceipts(session: RestaurantAdminSession, shiftId?: string): Promise<LateShiftReceipt[]> {
  // Report callers have already checked ownership of the selected shift.
  if (session.role === "staff" && !shiftId) return [];
  const db = getSupabaseAdmin();
  if (!db) throw new Error("Late shift receipts could not be loaded.");
  let query = db.from("orders").select("id,shift_id,total,payment_method,created_at,punched_at")
    .eq("restaurant_id", session.restaurantId).eq("late_shift_entry", true)
    .order("created_at", { ascending: false }).limit(100);
  if (shiftId) query = query.eq("shift_id", shiftId);
  const { data, error } = await query;
  if (error) throw new Error("Late shift receipts could not be loaded.");
  const receipts = (data ?? []) as Omit<LateShiftReceipt, "included_in_report_version">[];
  if (!receipts.length) return [];

  const shiftIds = [...new Set(receipts.map((receipt) => receipt.shift_id))];
  const { data: shifts, error: shiftError } = await db.from("restaurant_shifts")
    .select("id,close_report_version,close_report_generated_at")
    .eq("restaurant_id", session.restaurantId).in("id", shiftIds);
  if (shiftError) throw new Error("Late shift receipts could not be loaded.");
  const reportById = new Map((shifts ?? []).map((shift) => [shift.id as string, shift]));

  // The database recalculates the shift report in the same transaction that
  // saves a late receipt, unless its business day was already closed. A report
  // generated at or after the receipt was saved therefore includes it.
  return receipts.map((receipt) => {
    const report = reportById.get(receipt.shift_id);
    const version = Number(report?.close_report_version ?? 0);
    const generatedAt = report?.close_report_generated_at as string | null | undefined;
    const included = version > 0 && Boolean(generatedAt) &&
      Date.parse(generatedAt as string) >= Date.parse(receipt.created_at);
    return { ...receipt, included_in_report_version: included ? version : null };
  });
}

/**
 * Every paid-out of a closed shift (voided ones included, for audit), plus
 * whether its business day is closed (closed days are final: no voids).
 * Callers must already have checked the viewer may see this shift's report.
 */
export async function getClosedShiftPaidOuts(session: RestaurantAdminSession, shiftId: string) {
  const db = getSupabaseAdmin();
  if (!db) throw new Error("Shift paid-outs could not be loaded.");
  const [{ data: paidOuts, error }, { data: shift, error: shiftError }] = await Promise.all([
    db.from("shift_cash_paid_outs").select("*")
      .eq("restaurant_id", session.restaurantId).eq("shift_id", shiftId)
      .order("recorded_at").limit(200),
    db.from("restaurant_shifts").select("business_day_id")
      .eq("restaurant_id", session.restaurantId).eq("id", shiftId).maybeSingle()
  ]);
  if (error || shiftError) throw new Error("Shift paid-outs could not be loaded.");
  let businessDayClosed = false;
  if (shift?.business_day_id) {
    const { data: day } = await db.from("business_days").select("status")
      .eq("restaurant_id", session.restaurantId).eq("id", shift.business_day_id).maybeSingle();
    businessDayClosed = day?.status === "closed";
  }
  return { paidOuts: (paidOuts ?? []) as ShiftCashPaidOut[], businessDayClosed };
}

/**
 * Display names for the people who opened/closed the given shifts. The IDs come
 * from this tenant's own shift rows, so no other tenant's users are looked up.
 */
export async function getShiftStaffNames(shifts: RestaurantShift[]) {
  const ids = [...new Set(shifts.flatMap((shift) =>
    [shift.opened_by_user_id, shift.closed_by_user_id].filter(
      (id): id is string => Boolean(id)
    )
  ))];
  const names = new Map<string, string>();
  const db = getSupabaseAdmin();
  if (!db || ids.length === 0) return names;
  const { data, error } = await db.from("profiles").select("id,full_name,email").in("id", ids);
  if (error) return names;
  for (const profile of data ?? []) {
    const name = String(profile.full_name ?? "").trim() || String(profile.email ?? "").split("@")[0];
    if (name) names.set(String(profile.id), name);
  }
  return names;
}
