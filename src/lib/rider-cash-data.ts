import "server-only";

import { getRestaurantDateKey, getRestaurantDayStartIso } from "@/lib/date-time";
import {
  fromMinorUnits,
  summarizeRiderLedger,
  toMinorUnits,
  type RiderCashEntryType
} from "@/lib/rider-cash";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { DeliveryRider, RestaurantLocalization } from "@/lib/types";

const MAX_REPORT_DAYS = 92;
const MAX_REPORT_ASSIGNMENTS = 3000;

export type RiderCashEntry = {
  id: string;
  rider_id: string;
  entry_type: RiderCashEntryType;
  amount: number;
  order_id: string | null;
  note: string | null;
  actor_role: string | null;
  created_at: string;
};

/** Cash each rider should be holding right now, keyed by rider id. */
export async function getRiderCashBalances(restaurantId: string): Promise<Record<string, number>> {
  const admin = getSupabaseAdmin();

  if (!admin) {
    return {};
  }

  const { data, error } = await admin.rpc("get_rider_cash_balances", {
    target_restaurant_id: restaurantId
  });

  if (error) {
    throw new Error("Rider cash balances could not be loaded.");
  }

  const balances: Record<string, number> = {};

  for (const row of (data ?? []) as Array<{ rider_id: string; balance: number | string }>) {
    balances[row.rider_id] = Number(row.balance);
  }

  return balances;
}

export async function getRecentRiderCashEntries(
  restaurantId: string,
  limit = 40
): Promise<RiderCashEntry[]> {
  const admin = getSupabaseAdmin();

  if (!admin) {
    return [];
  }

  const { data, error } = await admin
    .from("rider_cash_entries")
    .select("id,rider_id,entry_type,amount,order_id,note,actor_role,created_at")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error("Rider cash entries could not be loaded.");
  }

  return ((data ?? []) as RiderCashEntry[]).map((entry) => ({ ...entry, amount: Number(entry.amount) }));
}

/** All of one rider's entries, newest first (used to settle exactly). */
export async function getRiderBalance(restaurantId: string, riderId: string): Promise<number> {
  const admin = getSupabaseAdmin();

  if (!admin) {
    throw new Error("Rider cash is unavailable.");
  }

  const { data, error } = await admin
    .from("rider_cash_entries")
    .select("entry_type,amount")
    .eq("restaurant_id", restaurantId)
    .eq("rider_id", riderId);

  if (error) {
    throw new Error("Rider cash balance could not be loaded.");
  }

  return summarizeRiderLedger(
    ((data ?? []) as Array<{ entry_type: RiderCashEntryType; amount: number | string }>).map((row) => ({
      entry_type: row.entry_type,
      amount: Number(row.amount)
    }))
  ).balance;
}

export type RiderReportRange = {
  fromKey: string;
  toKey: string;
  startIso: string;
  endExclusiveIso: string;
};

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Restaurant-local day range from ?from=&to= (defaults to today). */
export function resolveRiderReportRange(
  from: string | undefined,
  to: string | undefined,
  restaurant: Partial<RestaurantLocalization>,
  now = new Date()
): RiderReportRange {
  const today = getRestaurantDateKey(now, restaurant);
  let fromKey = from && getRestaurantDayStartIso(from, restaurant) ? from : today;
  let toKey = to && getRestaurantDayStartIso(to, restaurant) ? to : fromKey;

  if (toKey < fromKey) {
    [fromKey, toKey] = [toKey, fromKey];
  }

  const earliest = addDays(toKey, -(MAX_REPORT_DAYS - 1));

  if (fromKey < earliest) {
    fromKey = earliest;
  }

  return {
    fromKey,
    toKey,
    startIso: getRestaurantDayStartIso(fromKey, restaurant) ?? new Date(now).toISOString(),
    endExclusiveIso:
      getRestaurantDayStartIso(addDays(toKey, 1), restaurant) ?? new Date(now).toISOString()
  };
}

export type RiderReportRow = {
  rider: DeliveryRider;
  delivered: number;
  failed: number;
  cashValue: number;
  cardValue: number;
  otherValue: number;
  avgMinutes: number | null;
  methodChanges: number;
  cashHandedOver: number;
  variance: number;
  balance: number;
};

type ReportAssignment = {
  order_id: string;
  rider_id: string;
  created_at: string;
  outcome: "delivered" | "failed" | null;
  outcome_at: string | null;
  collected_method: string | null;
  method_changed: boolean | null;
};

export async function getRiderReport(
  restaurantId: string,
  riders: DeliveryRider[],
  range: RiderReportRange
): Promise<{ rows: RiderReportRow[]; truncated: boolean }> {
  const admin = getSupabaseAdmin();

  if (!admin) {
    return { rows: [], truncated: false };
  }

  const [assignmentsResult, entriesResult, balances] = await Promise.all([
    admin
      .from("order_rider_assignments")
      .select("order_id,rider_id,created_at,outcome,outcome_at,collected_method,method_changed")
      .eq("restaurant_id", restaurantId)
      .not("outcome", "is", null)
      .gte("outcome_at", range.startIso)
      .lt("outcome_at", range.endExclusiveIso)
      .order("outcome_at", { ascending: false })
      .limit(MAX_REPORT_ASSIGNMENTS),
    admin
      .from("rider_cash_entries")
      .select("rider_id,entry_type,amount")
      .eq("restaurant_id", restaurantId)
      .in("entry_type", ["handover", "variance"])
      .gte("created_at", range.startIso)
      .lt("created_at", range.endExclusiveIso),
    getRiderCashBalances(restaurantId)
  ]);

  if (assignmentsResult.error || entriesResult.error) {
    throw new Error("The rider report could not be loaded.");
  }

  const assignments = (assignmentsResult.data ?? []) as ReportAssignment[];
  const deliveredOrderIds = assignments
    .filter((assignment) => assignment.outcome === "delivered")
    .map((assignment) => assignment.order_id);
  const totals = new Map<string, number>();

  for (let index = 0; index < deliveredOrderIds.length; index += 200) {
    const slice = deliveredOrderIds.slice(index, index + 200);
    const { data, error } = await admin
      .from("orders")
      .select("id,total")
      .eq("restaurant_id", restaurantId)
      .in("id", slice);

    if (error) {
      throw new Error("The rider report could not be loaded.");
    }

    for (const order of (data ?? []) as Array<{ id: string; total: number | string }>) {
      totals.set(order.id, Number(order.total));
    }
  }

  const rows = new Map<string, RiderReportRow & { minutes: number[]; cents: { cash: number; card: number; other: number } }>();

  for (const rider of riders) {
    rows.set(rider.id, {
      rider,
      delivered: 0,
      failed: 0,
      cashValue: 0,
      cardValue: 0,
      otherValue: 0,
      avgMinutes: null,
      methodChanges: 0,
      cashHandedOver: 0,
      variance: 0,
      balance: balances[rider.id] ?? 0,
      minutes: [],
      cents: { cash: 0, card: 0, other: 0 }
    });
  }

  for (const assignment of assignments) {
    const row = rows.get(assignment.rider_id);

    if (!row) {
      continue;
    }

    if (assignment.outcome === "failed") {
      row.failed += 1;
      continue;
    }

    row.delivered += 1;
    const cents = toMinorUnits(totals.get(assignment.order_id) ?? 0);

    if (assignment.collected_method === "Cash on Delivery") row.cents.cash += cents;
    else if (assignment.collected_method === "Card on Delivery") row.cents.card += cents;
    else row.cents.other += cents;

    if (assignment.method_changed) {
      row.methodChanges += 1;
    }

    if (assignment.outcome_at) {
      const minutes = (Date.parse(assignment.outcome_at) - Date.parse(assignment.created_at)) / 60000;

      if (Number.isFinite(minutes) && minutes >= 0 && minutes < 360) {
        row.minutes.push(minutes);
      }
    }
  }

  for (const entry of (entriesResult.data ?? []) as Array<{
    rider_id: string;
    entry_type: RiderCashEntryType;
    amount: number | string;
  }>) {
    const row = rows.get(entry.rider_id);

    if (!row) {
      continue;
    }

    if (entry.entry_type === "handover") {
      row.cashHandedOver = fromMinorUnits(toMinorUnits(row.cashHandedOver) - toMinorUnits(Number(entry.amount)));
    } else {
      row.variance = fromMinorUnits(toMinorUnits(row.variance) + toMinorUnits(Number(entry.amount)));
    }
  }

  const result = [...rows.values()].map(({ minutes, cents, ...row }) => ({
    ...row,
    cashValue: fromMinorUnits(cents.cash),
    cardValue: fromMinorUnits(cents.card),
    otherValue: fromMinorUnits(cents.other),
    avgMinutes: minutes.length ? Math.round(minutes.reduce((sum, value) => sum + value, 0) / minutes.length) : null
  }));

  return {
    rows: result.filter(
      (row) =>
        row.rider.is_active ||
        row.delivered > 0 ||
        row.failed > 0 ||
        row.balance !== 0 ||
        row.cashHandedOver > 0
    ),
    truncated: assignments.length >= MAX_REPORT_ASSIGNMENTS
  };
}
