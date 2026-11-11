import { allocateFils, splitVatInclusiveFils, variableFeeFils } from "@/lib/finance-costing";

const DAY_MS = 86_400_000;

export type FinanceReportOrder = {
  id: string;
  totalFils: number;
  deliveryFeeFils: number;
  discountFils: number;
  channel: string;
  feeBps: number;
  promotionFils: number;
};

export type FinanceReportSnapshot = {
  orderId: string;
  menuItemId: string | null;
  name: string;
  quantity: number;
  revenueFils: number;
  directCostFils: number | null;
  completeness: "complete" | "missing_item" | "missing_recipe" | "missing_option_recipe" | "missing_price";
};

export type FinanceProductContribution = {
  menuItemId: string;
  name: string;
  units: number;
  netRevenueFils: number;
  directCostFils: number | null;
  channelFeesFils: number;
  contributionFils: number | null;
  contributionPerUnitFils: number | null;
  completeness: "complete" | "incomplete";
};

export type FinanceOperatingReport = {
  orderCount: number;
  grossCustomerSalesFils: number;
  outputVatFils: number;
  netSalesFils: number;
  knownDirectCostFils: number;
  estimatedConsumedCostFils: number | null;
  channelFeesFils: number;
  accruedOperatingCostFils: number;
  purchaseSpendFils: number;
  cashOutflowFils: number;
  estimatedOperatingResultFils: number | null;
  coveragePct: number;
  breakEvenSalesFils: number | null;
  products: FinanceProductContribution[];
  warnings: string[];
};

function validFils(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function buildFinanceOperatingReport({
  accruedOperatingCostFils,
  cashOutflowFils,
  orders,
  outputVatRateBps,
  pricesIncludeVat,
  purchaseSpendFils,
  snapshots
}: {
  accruedOperatingCostFils: number;
  cashOutflowFils: number;
  orders: FinanceReportOrder[];
  outputVatRateBps: number;
  pricesIncludeVat: boolean;
  purchaseSpendFils: number;
  snapshots: FinanceReportSnapshot[];
}): FinanceOperatingReport {
  if (![accruedOperatingCostFils, cashOutflowFils, purchaseSpendFils].every(validFils)) {
    throw new Error("Invalid report totals.");
  }
  const snapshotsByOrder = new Map<string, FinanceReportSnapshot[]>();
  for (const snapshot of snapshots) {
    const rows = snapshotsByOrder.get(snapshot.orderId) ?? [];
    rows.push(snapshot);
    snapshotsByOrder.set(snapshot.orderId, rows);
  }

  let grossCustomerSalesFils = 0;
  let outputVatFils = 0;
  let knownDirectCostFils = 0;
  let channelFeesFils = 0;
  let coveredRevenueFils = 0;
  let totalProductNetRevenueFils = 0;
  const products = new Map<string, FinanceProductContribution>();

  for (const order of orders) {
    grossCustomerSalesFils += order.totalFils;
    const orderVat = pricesIncludeVat
      ? splitVatInclusiveFils(order.totalFils, outputVatRateBps).vatFils
      : 0;
    outputVatFils += orderVat;
    const orderSnapshots = snapshotsByOrder.get(order.id) ?? [];
    const lineRevenue = orderSnapshots.map((row) => row.revenueFils);
    const discountAllocation = allocateFils(Math.min(order.discountFils, lineRevenue.reduce((sum, value) => sum + value, 0)), lineRevenue);
    const orderFee = variableFeeFils(order.totalFils, order.feeBps) + order.promotionFils;
    channelFeesFils += orderFee;
    const feeAllocation = allocateFils(orderFee, lineRevenue);

    orderSnapshots.forEach((snapshot, index) => {
      const afterDiscount = Math.max(0, snapshot.revenueFils - discountAllocation[index]);
      const netRevenue = pricesIncludeVat
        ? splitVatInclusiveFils(afterDiscount, outputVatRateBps).netFils
        : afterDiscount;
      totalProductNetRevenueFils += netRevenue;
      const complete = snapshot.completeness === "complete" && snapshot.directCostFils !== null;
      if (complete) {
        knownDirectCostFils += snapshot.directCostFils!;
        coveredRevenueFils += netRevenue;
      }
      const key = snapshot.menuItemId ?? `${snapshot.orderId}:unknown:${index}`;
      const current = products.get(key) ?? {
        menuItemId: key,
        name: snapshot.name,
        units: 0,
        netRevenueFils: 0,
        directCostFils: 0,
        channelFeesFils: 0,
        contributionFils: 0,
        contributionPerUnitFils: 0,
        completeness: "complete" as const
      };
      current.units += snapshot.quantity;
      current.netRevenueFils += netRevenue;
      current.channelFeesFils += feeAllocation[index];
      if (complete && current.directCostFils !== null && current.contributionFils !== null) {
        current.directCostFils += snapshot.directCostFils!;
        current.contributionFils = current.netRevenueFils - current.directCostFils - current.channelFeesFils;
      } else {
        current.directCostFils = null;
        current.contributionFils = null;
        current.contributionPerUnitFils = null;
        current.completeness = "incomplete";
      }
      if (current.contributionFils !== null) {
        current.contributionPerUnitFils = Math.round(current.contributionFils / current.units);
      }
      products.set(key, current);
    });
  }

  const netSalesFils = grossCustomerSalesFils - outputVatFils;
  const coveragePct = totalProductNetRevenueFils > 0
    ? coveredRevenueFils * 100 / totalProductNetRevenueFils
    : 0;
  const estimatedConsumedCostFils = coveredRevenueFils > 0
    ? Math.round(knownDirectCostFils * totalProductNetRevenueFils / coveredRevenueFils)
    : null;
  const estimatedOperatingResultFils = estimatedConsumedCostFils === null
    ? null
    : netSalesFils - estimatedConsumedCostFils - channelFeesFils - accruedOperatingCostFils;
  const contributionBeforeFixed = estimatedConsumedCostFils === null
    ? null
    : netSalesFils - estimatedConsumedCostFils - channelFeesFils;
  const contributionMargin = contributionBeforeFixed !== null && netSalesFils > 0
    ? contributionBeforeFixed / netSalesFils
    : 0;
  const breakEvenSalesFils = coveragePct >= 80 && contributionMargin > 0
    ? Math.ceil(accruedOperatingCostFils / contributionMargin)
    : null;
  const warnings: string[] = [];
  if (coveragePct < 100) warnings.push(`Recipe coverage is ${coveragePct.toFixed(1)}%; consumed cost is extrapolated from covered sales.`);
  if (coveragePct < 80) warnings.push("Break-even is hidden until at least 80% of product revenue has complete costs.");
  if (orders.some((order) => order.channel !== "direct")) warnings.push("Channel fees use the explicitly assigned order channel and fee rate.");
  warnings.push("Refund transactions are not represented in the current order schema; cancelled orders are excluded upstream.");

  return {
    orderCount: orders.length,
    grossCustomerSalesFils,
    outputVatFils,
    netSalesFils,
    knownDirectCostFils,
    estimatedConsumedCostFils,
    channelFeesFils,
    accruedOperatingCostFils,
    purchaseSpendFils,
    cashOutflowFils,
    estimatedOperatingResultFils,
    coveragePct,
    breakEvenSalesFils,
    products: [...products.values()].toSorted((first, second) =>
      (second.contributionFils ?? Number.MIN_SAFE_INTEGER) - (first.contributionFils ?? Number.MIN_SAFE_INTEGER)
      || second.units - first.units || first.name.localeCompare(second.name)
    ),
    warnings
  };
}

function isoDay(value: string) {
  return Date.parse(`${value}T00:00:00Z`);
}

function inclusiveDays(start: string, end: string) {
  return Math.floor((isoDay(end) - isoDay(start)) / DAY_MS) + 1;
}

export function allocatedExpenseForRange({
  amountFils,
  incurredOn,
  rangeEnd,
  rangeStart,
  serviceEnd,
  serviceStart
}: {
  amountFils: number;
  incurredOn: string;
  rangeEnd: string;
  rangeStart: string;
  serviceEnd: string | null;
  serviceStart: string | null;
}) {
  if (!serviceStart || !serviceEnd) return incurredOn >= rangeStart && incurredOn <= rangeEnd ? amountFils : 0;
  const overlapStart = serviceStart > rangeStart ? serviceStart : rangeStart;
  const overlapEnd = serviceEnd < rangeEnd ? serviceEnd : rangeEnd;
  if (overlapStart > overlapEnd) return 0;
  const allocation = allocateFils(amountFils, Array.from({ length: inclusiveDays(serviceStart, serviceEnd) }, () => 1));
  const offset = Math.floor((isoDay(overlapStart) - isoDay(serviceStart)) / DAY_MS);
  return allocation.slice(offset, offset + inclusiveDays(overlapStart, overlapEnd)).reduce((sum, value) => sum + value, 0);
}

export function monthlyRecurringAccrualFils(amountFils: number, allocationMonths: number) {
  if (!Number.isSafeInteger(amountFils) || amountFils <= 0 || !Number.isInteger(allocationMonths) || allocationMonths <= 0) {
    throw new Error("Invalid recurring allocation.");
  }
  return allocateFils(amountFils, Array.from({ length: allocationMonths }, () => 1))[0];
}

export function recurringAccrualForRange({
  allocationMonths,
  amountFils,
  endOn,
  frequency,
  rangeEnd,
  rangeStart,
  startOn
}: {
  allocationMonths: number;
  amountFils: number;
  endOn: string | null;
  frequency: "weekly" | "monthly" | "quarterly" | "yearly";
  rangeEnd: string;
  rangeStart: string;
  startOn: string;
}) {
  const activeStart = startOn > rangeStart ? startOn : rangeStart;
  const activeEnd = endOn && endOn < rangeEnd ? endOn : rangeEnd;
  if (activeStart > activeEnd) return 0;
  if (frequency === "weekly") {
    return Math.round(amountFils * inclusiveDays(activeStart, activeEnd) / 7);
  }
  const monthlyFils = monthlyRecurringAccrualFils(amountFils, allocationMonths);
  let cursor = `${activeStart.slice(0, 7)}-01`;
  let total = 0;
  while (cursor <= activeEnd) {
    const [year, month] = cursor.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const overlapStart = activeStart > cursor ? activeStart : cursor;
    const overlapEnd = activeEnd < monthEnd ? activeEnd : monthEnd;
    if (overlapStart <= overlapEnd) {
      total += Math.round(monthlyFils * inclusiveDays(overlapStart, overlapEnd) / inclusiveDays(cursor, monthEnd));
    }
    cursor = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  }
  return total;
}
