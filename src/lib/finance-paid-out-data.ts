import "server-only";

import { paidOutAmountToFils, rankLinkCandidates } from "@/lib/finance-paid-outs";
import { planAllowsOrFalse } from "@/lib/plan-gates";
import type { RestaurantAdminSession } from "@/lib/super-admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export type UnbilledPaidOut = {
  paidOutId: string;
  shiftId: string;
  shiftStatus: string;
  amountFils: number;
  reason: string;
  recordedAt: string;
  businessDate: string;
};

export type PaidOutLinkCandidate = {
  id: string;
  description: string;
  supplier_name: string | null;
  incurred_on: string;
  total_fils: number;
  status: "draft" | "approved";
  payment_method: string | null;
};

export type PaidOutLinkRow = {
  id: string;
  paid_out_id: string;
  expense_id: string | null;
  status: "linked" | "dismissed";
  paid_out_amount_fils: number;
  expense_total_fils: number | null;
  difference_fils: number | null;
  mismatch_reason: string | null;
  dismiss_reason: string | null;
  created_at: string;
  paidOutReason: string | null;
  expenseDescription: string | null;
};

export type PaidOutBillStatus = "linked" | "dismissed" | "none";

/** Whether the shift ↔ finance link applies to this restaurant at all. */
export async function paidOutLinkingAvailable(session: RestaurantAdminSession) {
  return session.restaurant.finance_enabled === true &&
    session.restaurant.currency_code === "AED" &&
    await planAllowsOrFalse(session.restaurantId, "finance");
}

export async function getUnbilledPaidOuts(restaurantId: string, limit = 200): Promise<UnbilledPaidOut[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data, error } = await admin.rpc("get_finance_unbilled_paid_outs", {
    target_restaurant_id: restaurantId,
    requested_limit: limit
  });
  if (error) throw new Error("Cash paid-outs could not be loaded.");
  const rows: UnbilledPaidOut[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const amountFils = paidOutAmountToFils(row.amount);
    if (amountFils === null) continue;
    rows.push({
      paidOutId: String(row.paid_out_id),
      shiftId: String(row.shift_id),
      shiftStatus: String(row.shift_status),
      amountFils,
      reason: String(row.reason ?? ""),
      recordedAt: String(row.recorded_at),
      businessDate: String(row.business_date)
    });
  }
  return rows;
}

/** Non-void expenses from the last 120 days that are not yet linked. */
export async function getPaidOutLinkCandidatePool(restaurantId: string): Promise<PaidOutLinkCandidate[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const { data: expenses, error } = await admin.from("finance_expenses")
    .select("id,description,supplier_name,incurred_on,total_fils,status,payment_method")
    .eq("restaurant_id", restaurantId).neq("status", "void").gte("incurred_on", since)
    .order("incurred_on", { ascending: false }).limit(400);
  if (error) throw new Error("Expenses could not be loaded.");
  const ids = (expenses ?? []).map((row) => String(row.id));
  const linked = new Set<string>();
  for (let index = 0; index < ids.length; index += 150) {
    const { data: links, error: linkError } = await admin.from("finance_paid_out_links").select("expense_id")
      .eq("restaurant_id", restaurantId).is("removed_at", null)
      .in("expense_id", ids.slice(index, index + 150));
    if (linkError) throw new Error("Expenses could not be loaded.");
    for (const row of links ?? []) linked.add(String(row.expense_id));
  }
  return ((expenses ?? []) as Array<Record<string, unknown>>)
    .filter((row) => !linked.has(String(row.id)))
    .map((row) => ({
      id: String(row.id),
      description: String(row.description),
      supplier_name: row.supplier_name ? String(row.supplier_name) : null,
      incurred_on: String(row.incurred_on),
      total_fils: Number(row.total_fils),
      status: row.status as "draft" | "approved",
      payment_method: row.payment_method ? String(row.payment_method) : null
    }));
}

export function candidatesForPaidOut(pool: PaidOutLinkCandidate[], paidOut: UnbilledPaidOut, limit = 10) {
  return rankLinkCandidates(pool, paidOut.amountFils, paidOut.businessDate, limit);
}

export async function getRecentPaidOutLinks(restaurantId: string, limit = 50): Promise<PaidOutLinkRow[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data, error } = await admin.from("finance_paid_out_links")
    .select("id,paid_out_id,expense_id,status,paid_out_amount_fils,expense_total_fils,difference_fils,mismatch_reason,dismiss_reason,created_at")
    .eq("restaurant_id", restaurantId).is("removed_at", null)
    .order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error("Paid-out links could not be loaded.");
  const links = (data ?? []) as Array<Record<string, unknown>>;
  if (links.length === 0) return [];
  const paidOutIds = links.map((row) => String(row.paid_out_id));
  const expenseIds = links.filter((row) => row.expense_id).map((row) => String(row.expense_id));
  const [{ data: paidOuts }, { data: expenses }] = await Promise.all([
    admin.from("shift_cash_paid_outs").select("id,reason")
      .eq("restaurant_id", restaurantId).in("id", paidOutIds),
    expenseIds.length > 0
      ? admin.from("finance_expenses").select("id,description")
        .eq("restaurant_id", restaurantId).in("id", expenseIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> })
  ]);
  const reasonById = new Map((paidOuts ?? []).map((row) => [String(row.id), String(row.reason)]));
  const descriptionById = new Map((expenses ?? []).map((row) => [String(row.id), String(row.description)]));
  return links.map((row) => ({
    id: String(row.id),
    paid_out_id: String(row.paid_out_id),
    expense_id: row.expense_id ? String(row.expense_id) : null,
    status: row.status as "linked" | "dismissed",
    paid_out_amount_fils: Number(row.paid_out_amount_fils),
    expense_total_fils: row.expense_total_fils === null ? null : Number(row.expense_total_fils),
    difference_fils: row.difference_fils === null ? null : Number(row.difference_fils),
    mismatch_reason: row.mismatch_reason ? String(row.mismatch_reason) : null,
    dismiss_reason: row.dismiss_reason ? String(row.dismiss_reason) : null,
    created_at: String(row.created_at),
    paidOutReason: reasonById.get(String(row.paid_out_id)) ?? null,
    expenseDescription: row.expense_id ? descriptionById.get(String(row.expense_id)) ?? null : null
  }));
}

/**
 * Bill status per paid-out for shift screens. Returns null when linking does
 * not apply to this restaurant (finance off, plan without finance, non-AED),
 * so shift screens render exactly as before. Exposes no finance amounts.
 */
export async function getPaidOutBillStatuses(
  session: RestaurantAdminSession,
  paidOutIds: string[]
): Promise<Map<string, PaidOutBillStatus> | null> {
  if (!(await paidOutLinkingAvailable(session))) return null;
  const statuses = new Map<string, PaidOutBillStatus>(paidOutIds.map((id) => [id, "none"]));
  const admin = getSupabaseAdmin();
  if (!admin || paidOutIds.length === 0) return statuses;
  for (let index = 0; index < paidOutIds.length; index += 200) {
    const { data, error } = await admin.from("finance_paid_out_links").select("paid_out_id,status")
      .eq("restaurant_id", session.restaurantId).is("removed_at", null)
      .in("paid_out_id", paidOutIds.slice(index, index + 200));
    if (error) return null;
    for (const row of data ?? []) {
      statuses.set(String(row.paid_out_id), row.status === "dismissed" ? "dismissed" : "linked");
    }
  }
  return statuses;
}

export type ShiftPaidOutBill = {
  id: string;
  reason: string;
  amount: number;
  recorded_at: string;
  status: PaidOutBillStatus;
};

/** Paid-outs of one shift with their bill status, or null when linking doesn't apply. */
export async function getShiftPaidOutBills(
  session: RestaurantAdminSession,
  shiftId: string
): Promise<ShiftPaidOutBill[] | null> {
  if (!(await paidOutLinkingAvailable(session))) return null;
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin.from("shift_cash_paid_outs")
    .select("id,reason,amount,recorded_at")
    .eq("restaurant_id", session.restaurantId).eq("shift_id", shiftId)
    .order("recorded_at").limit(200);
  if (error) return null;
  const rows = (data ?? []) as Array<{ id: string; reason: string; amount: number; recorded_at: string }>;
  const statuses = await getPaidOutBillStatuses(session, rows.map((row) => row.id));
  if (!statuses) return null;
  return rows.map((row) => ({
    id: String(row.id),
    reason: String(row.reason),
    amount: Number(row.amount),
    recorded_at: String(row.recorded_at),
    status: statuses.get(String(row.id)) ?? "none"
  }));
}
