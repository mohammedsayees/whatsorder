// Customer credit and payment-method figures for shift reports. Pure, so the
// web report and the thermal print show the same numbers.
import type { ShiftCloseReportSnapshot } from "@/lib/types";

const roundMoney = (value: number) => Math.round(value * 100) / 100;
const material = (value: number) => Math.abs(value) >= 0.005;

export type SalesByPayment = {
  cash: number;
  card: number;
  upi: number;
  /** Null on versions written before credit sales were recorded. */
  credit: number | null;
  /**
   * Completed sales not paid by cash, card or UPI. On older versions this is
   * credit and unrecorded payments together; on newer ones, unrecorded only.
   */
  remainder: number;
};

/** Completed sales split by how they were paid; the parts add up to completed sales. */
export function salesByPayment(report: ShiftCloseReportSnapshot): SalesByPayment {
  const cash = roundMoney(report.completed_cash_order_total);
  const card = roundMoney(report.expected_card_amount - report.card_other_income_total);
  const upi = report.country_code === "IN"
    ? roundMoney(report.expected_upi_amount - report.upi_other_income_total)
    : 0;
  const notCashCardUpi = roundMoney(report.completed_sales - cash - card - upi);
  const credit = report.credit_sales
    ? roundMoney(report.credit_sales.reduce((sum, sale) => sum + sale.amount, 0))
    : null;
  const remainder = credit === null ? notCashCardUpi : roundMoney(notCashCardUpi - credit);
  return { cash, card, upi, credit, remainder: material(remainder) ? remainder : 0 };
}

export type CreditCollected = {
  total: number;
  /** Per payment method; empty when only the total was recorded (older versions). */
  byMethod: Record<string, number>;
};

/** Customer credit repayments taken in this shift (voided entries excluded). */
export function creditCollected(report: ShiftCloseReportSnapshot): CreditCollected {
  if (!report.other_income_entries) {
    return { total: roundMoney(report.credit_repayment_total), byMethod: {} };
  }
  const byMethod: Record<string, number> = {};
  let total = 0;
  for (const entry of report.other_income_entries) {
    if (entry.category !== "customer_credit_repayment" || entry.voided_at) continue;
    byMethod[entry.payment_method] = roundMoney((byMethod[entry.payment_method] ?? 0) + entry.amount);
    total += entry.amount;
  }
  return { total: roundMoney(total), byMethod };
}

/** Whether the report has any credit activity worth a section. */
export function hasCreditActivity(report: ShiftCloseReportSnapshot) {
  return Boolean(report.credit_sales?.length) || material(creditCollected(report).total);
}
