// Unbilled sales are stored as shift receipts (category "unbilled_sale") so the
// drawer reconciles, but they are sales: every screen shows them under sales
// and takes them out of "other income". Pure helpers keep that split identical
// on the shifts page, the web report, the thermal print and the day report.

const roundMoney = (value: number) => Math.round(value * 100) / 100;

type ReceiptEntry = {
  category: string;
  payment_method: string;
  amount: number;
  voided_at: string | null;
};

export type UnbilledSales = {
  total: number;
  byMethod: Record<string, number>;
};

export const UNBILLED_SALE = "unbilled_sale";

/** Totals of non-voided unbilled sales in a list of receipt entries. */
export function unbilledFromEntries(entries: ReceiptEntry[]): UnbilledSales {
  const byMethod: Record<string, number> = {};
  let total = 0;
  for (const entry of entries) {
    if (entry.category !== UNBILLED_SALE || entry.voided_at) continue;
    byMethod[entry.payment_method] = roundMoney((byMethod[entry.payment_method] ?? 0) + entry.amount);
    total += entry.amount;
  }
  return { total: roundMoney(total), byMethod };
}

/**
 * Unbilled sales for a report: from its itemized entries when it has them,
 * otherwise from the category breakdown (total only).
 */
export function unbilledFromReport(report: {
  other_income_entries?: ReceiptEntry[] | null;
  other_income_breakdown?: Partial<Record<string, number>> | null;
}): UnbilledSales {
  if (report.other_income_entries) {
    return unbilledFromEntries(report.other_income_entries);
  }
  return {
    total: roundMoney(Number(report.other_income_breakdown?.[UNBILLED_SALE] ?? 0)),
    byMethod: {}
  };
}

/** Other income with unbilled sales taken out (they are shown as sales). */
export function otherIncomeExcludingUnbilled(
  report: {
    other_income_total: number;
    cash_other_income_total: number;
    card_other_income_total: number;
    upi_other_income_total: number;
  },
  unbilled: UnbilledSales
) {
  return {
    total: roundMoney(report.other_income_total - unbilled.total),
    cash: roundMoney(report.cash_other_income_total - (unbilled.byMethod.cash ?? 0)),
    card: roundMoney(report.card_other_income_total - (unbilled.byMethod.card ?? 0)),
    upi: roundMoney(report.upi_other_income_total - (unbilled.byMethod.upi ?? 0))
  };
}

/** Category breakdown without unbilled sales, for "other income" lists. */
export function breakdownWithoutUnbilled<T extends Partial<Record<string, number>>>(breakdown: T) {
  return Object.fromEntries(
    Object.entries(breakdown).filter(([category]) => category !== UNBILLED_SALE)
  ) as T;
}

export type CashSalesSplit = {
  /** Cash from completed orders. */
  billed: number;
  /** Cash unbilled sales (no order). */
  unbilled: number;
  /** Billed + unbilled: all cash sales that went into the drawer. */
  total: number;
};

/** Total cash sales and its billed/unbilled parts. */
export function cashSalesSplit(billedCash: number, unbilled: UnbilledSales): CashSalesSplit {
  const unbilledCash = roundMoney(unbilled.byMethod.cash ?? 0);
  return {
    billed: roundMoney(billedCash),
    unbilled: unbilledCash,
    total: roundMoney(billedCash + unbilledCash)
  };
}
