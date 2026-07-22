import type {
  BusinessDayCloseReportSnapshot,
  OtherIncomeCategory,
  OtherIncomePaymentMethod
} from "@/lib/types";

export const otherIncomeCategoryLabels: Record<OtherIncomeCategory, string> = {
  used_oil_sale: "Used oil sale",
  scrap_sale: "Scrap sale",
  supplier_rebate: "Supplier rebate",
  rental_income: "Rental income",
  other: "Other income"
};

export const otherIncomePaymentLabels: Record<OtherIncomePaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  upi: "UPI",
  bank_transfer: "Bank transfer",
  other: "Other"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function parseBusinessDayCloseReportSnapshot(
  value: unknown
): BusinessDayCloseReportSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.shifts)) {
    return null;
  }

  const stringKeys = [
    "business_day_id", "business_date", "restaurant_id", "restaurant_name",
    "country_code", "currency_code", "time_zone", "opened_at", "closed_at",
    "report_generated_at"
  ] as const;
  if (stringKeys.some((key) => typeof value[key] !== "string" || !value[key])) {
    return null;
  }

  const numberKeys = [
    "schema_version", "report_version", "shift_count", "completed_order_count",
    "cancelled_order_count", "whatsorder_sales", "marketplace_sales",
    "combined_operational_sales", "other_income_total", "cash_other_income_total",
    "card_other_income_total", "upi_other_income_total", "bank_other_income_total",
    "total_operational_receipts", "cash_order_sales", "card_order_sales",
    "upi_order_sales", "cash_paid_out_total", "net_cash_movement",
    "cash_difference_total", "card_difference_total", "upi_difference_total",
    "final_cash_counted"
  ] as const;
  if (numberKeys.some((key) => typeof value[key] !== "number" || !Number.isFinite(value[key]))) {
    return null;
  }

  if ((value.country_code !== "AE" && value.country_code !== "IN") ||
      (value.currency_code !== "AED" && value.currency_code !== "INR") ||
      (value.time_zone !== "Asia/Dubai" && value.time_zone !== "Asia/Kolkata")) {
    return null;
  }

  const validShifts = value.shifts.every((shift) => {
    if (!isRecord(shift)) return false;
    return ["id", "name", "opened_at", "closed_at"].every(
      (key) => typeof shift[key] === "string" && shift[key]
    ) && [
      "completed_orders", "sales", "marketplace_sales", "other_income",
      "cash_paid_outs", "opening_cash", "expected_cash", "cash_counted",
      "cash_difference", "report_version"
    ].every((key) => typeof shift[key] === "number" && Number.isFinite(shift[key]));
  });
  if (!validShifts) return null;

  return value as unknown as BusinessDayCloseReportSnapshot;
}
