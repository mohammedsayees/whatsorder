import "server-only";

import { parseAedToFilsAllowZero } from "@/lib/finance";
import {
  allocatedExpenseForRange,
  buildFinanceOperatingReport,
  expenseCashPaidFils,
  expensePeriodFilter,
  recurringEffectiveEnd,
  recurringAccrualForRange,
  type FinanceOperatingReport,
  type FinanceReportOrder,
  type FinanceReportSnapshot
} from "@/lib/finance-report";
import { resolveReportRange, type ReportRange } from "@/lib/reports";
import type { RestaurantAdminSession } from "@/lib/super-admin-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { CartLine } from "@/lib/types";

const MAX_REPORT_ORDERS = 5000;

function toFils(value: unknown) {
  const parsed = parseAedToFilsAllowZero(value);
  if (parsed === null) throw new Error("Invalid persisted money value.");
  return parsed;
}

function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function previousEquivalentRange(range: ReportRange, session: RestaurantAdminSession) {
  const days = Math.round((Date.parse(`${range.endDate}T00:00:00Z`) - Date.parse(`${range.startDate}T00:00:00Z`)) / 86_400_000) + 1;
  const end = shiftIsoDate(range.startDate, -1);
  const start = shiftIsoDate(end, -(days - 1));
  return resolveReportRange("custom", start, end, new Date(), session.restaurant);
}

async function snapshotsForOrders(restaurantId: string, orderIds: string[]) {
  const admin = getSupabaseAdmin();
  if (!admin || orderIds.length === 0) return [];
  const rows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < orderIds.length; index += 200) {
    const { data } = await admin.from("finance_product_cost_snapshots")
      .select("order_id,line_index,menu_item_id,quantity,line_revenue_fils,total_direct_cost_fils,completeness")
      .eq("restaurant_id", restaurantId).in("order_id", orderIds.slice(index, index + 200));
    rows.push(...(data ?? []));
  }
  return rows;
}

async function channelsForOrders(restaurantId: string, orderIds: string[]) {
  const admin = getSupabaseAdmin();
  if (!admin || orderIds.length === 0) return [];
  const rows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < orderIds.length; index += 200) {
    const { data } = await admin.from("finance_order_channels")
      .select("order_id,channel,fee_bps,promotion_fils")
      .eq("restaurant_id", restaurantId).in("order_id", orderIds.slice(index, index + 200));
    rows.push(...(data ?? []));
  }
  return rows;
}

async function buildPeriodReport(session: RestaurantAdminSession, range: ReportRange) {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const [{ data: settings }, { data: orderRows }, { data: expenses }, { data: recurring }] = await Promise.all([
    admin.from("finance_settings").select("prices_include_vat,output_vat_rate_bps,direct_fee_bps")
      .eq("restaurant_id", session.restaurantId).single(),
    admin.from("orders").select("id,created_at,total,delivery_fee,loyalty_discount,items")
      .eq("restaurant_id", session.restaurantId).eq("status", "Completed")
      .gte("created_at", range.startIso).lt("created_at", range.endExclusiveIso)
      .order("created_at").limit(MAX_REPORT_ORDERS + 1),
    // Only expenses that can affect this period: incurred in it, a service
    // period overlapping it, or paid in it. History before that is never loaded.
    admin.from("finance_expenses")
      .select("id,incurred_on,service_period_start,service_period_end,subtotal_fils,total_fils,payment_status,paid_on,paid_amount_fils,recurring_cost_id,finance_categories!inner(classification)")
      .eq("restaurant_id", session.restaurantId).eq("status", "approved")
      .or(expensePeriodFilter(range.startDate, range.endDate))
      .limit(5001),
    // Paused schedules stay in past periods up to the day before they paused.
    admin.from("finance_recurring_costs")
      .select("amount_fils,frequency,allocation_months,start_on,end_on,paused_on,finance_categories!inner(classification)")
      .eq("restaurant_id", session.restaurantId)
      .lte("start_on", range.endDate)
      .limit(1000)
  ]);
  if (!settings || (orderRows?.length ?? 0) > MAX_REPORT_ORDERS || (expenses?.length ?? 0) > 5000) {
    throw new Error("Finance report range is too large for a safe interactive report.");
  }
  const ordersRaw = orderRows ?? [];
  const snapshotRows = await snapshotsForOrders(session.restaurantId, ordersRaw.map((order) => String(order.id)));
  const snapshotsByOrderLine = new Map(snapshotRows.map((row) => [`${row.order_id}:${row.line_index}`, row]));
  const channels = await channelsForOrders(session.restaurantId, ordersRaw.map((order) => String(order.id)));
  const channelByOrder = new Map(channels.map((row) => [String(row.order_id), row]));
  const orders: FinanceReportOrder[] = [];
  const snapshots: FinanceReportSnapshot[] = [];
  for (const order of ordersRaw) {
    const channel = channelByOrder.get(String(order.id));
    orders.push({
      id: String(order.id), totalFils: toFils(order.total),
      deliveryFeeFils: toFils(order.delivery_fee), discountFils: toFils(order.loyalty_discount),
      channel: String(channel?.channel ?? "direct"),
      feeBps: Number(channel?.fee_bps ?? settings.direct_fee_bps),
      promotionFils: Number(channel?.promotion_fils ?? 0)
    });
    const items = Array.isArray(order.items) ? order.items as unknown as CartLine[] : [];
    items.forEach((item, lineIndex) => {
      const saved = snapshotsByOrderLine.get(`${order.id}:${lineIndex}`);
      snapshots.push({
        orderId: String(order.id), menuItemId: saved?.menu_item_id ? String(saved.menu_item_id) : item.item_id || null,
        name: item.name || "Unknown item", quantity: Number(saved?.quantity ?? item.quantity ?? 1),
        revenueFils: Number(saved?.line_revenue_fils ?? toFils(item.price) * Number(item.quantity ?? 1)),
        directCostFils: saved?.total_direct_cost_fils === null || saved?.total_direct_cost_fils === undefined
          ? null : Number(saved.total_direct_cost_fils),
        completeness: (saved?.completeness ?? "missing_recipe") as FinanceReportSnapshot["completeness"]
      });
    });
  }

  let accruedOperatingCostFils = 0;
  let purchaseSpendFils = 0;
  let cashOutflowFils = 0;
  for (const expense of expenses ?? []) {
    const classification = (expense.finance_categories as unknown as { classification?: string } | null)?.classification;
    if (classification === "operating" && !expense.recurring_cost_id) {
      accruedOperatingCostFils += allocatedExpenseForRange({
        amountFils: Number(expense.subtotal_fils), incurredOn: String(expense.incurred_on),
        rangeStart: range.startDate, rangeEnd: range.endDate,
        serviceStart: expense.service_period_start ? String(expense.service_period_start) : null,
        serviceEnd: expense.service_period_end ? String(expense.service_period_end) : null
      });
    }
    if (classification === "purchase" && String(expense.incurred_on) >= range.startDate
        && String(expense.incurred_on) <= range.endDate) {
      purchaseSpendFils += Number(expense.subtotal_fils);
    }
    if (expense.paid_on && String(expense.paid_on) >= range.startDate && String(expense.paid_on) <= range.endDate) {
      cashOutflowFils += expenseCashPaidFils({
        paymentStatus: String(expense.payment_status),
        paidAmountFils: expense.paid_amount_fils === null || expense.paid_amount_fils === undefined
          ? null : Number(expense.paid_amount_fils),
        totalFils: Number(expense.total_fils)
      });
    }
  }
  for (const cost of recurring ?? []) {
    const classification = (cost.finance_categories as unknown as { classification?: string } | null)?.classification;
    if (classification !== "operating") continue;
    accruedOperatingCostFils += recurringAccrualForRange({
      allocationMonths: Number(cost.allocation_months), amountFils: Number(cost.amount_fils),
      endOn: recurringEffectiveEnd(
        cost.end_on ? String(cost.end_on) : null,
        cost.paused_on ? String(cost.paused_on) : null
      ),
      frequency: cost.frequency as "weekly" | "monthly" | "quarterly" | "yearly",
      rangeStart: range.startDate, rangeEnd: range.endDate, startOn: String(cost.start_on)
    });
  }
  return buildFinanceOperatingReport({
    accruedOperatingCostFils, cashOutflowFils, orders,
    outputVatRateBps: Number(settings.output_vat_rate_bps),
    pricesIncludeVat: Boolean(settings.prices_include_vat), purchaseSpendFils, snapshots
  });
}

export type FinanceReportBundle = {
  current: FinanceOperatingReport;
  prior: FinanceOperatingReport;
  range: ReportRange;
  priorRange: ReportRange;
};

export async function getFinanceReportBundle(session: RestaurantAdminSession, range: ReportRange): Promise<FinanceReportBundle | null> {
  const priorRange = previousEquivalentRange(range, session);
  const [current, prior] = await Promise.all([
    buildPeriodReport(session, range), buildPeriodReport(session, priorRange)
  ]);
  if (!current || !prior) return null;
  const admin = getSupabaseAdmin();
  // Usage telemetry: at most one row per user, restaurant and period every 10 minutes.
  const { data: recentRun } = admin
    ? await admin.from("finance_report_runs").select("id")
      .eq("restaurant_id", session.restaurantId).eq("generated_by", session.userId)
      .eq("period_start", range.startDate).eq("period_end", range.endDate)
      .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString()).limit(1)
    : { data: null };
  if (admin && (recentRun?.length ?? 0) === 0) {
    await admin.from("finance_report_runs").insert({
      restaurant_id: session.restaurantId, period_start: range.startDate, period_end: range.endDate,
      order_count: current.orderCount, coverage_bps: Math.round(current.coveragePct * 100),
      incomplete_line_count: current.products.filter((product) => product.completeness === "incomplete").length,
      generated_by: session.userId
    });
  }
  return { current, prior, range, priorRange };
}
