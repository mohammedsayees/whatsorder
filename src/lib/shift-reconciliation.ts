import type {
  CountryCode,
  ShiftCloseReportSnapshot,
  ShiftFulfilmentSummary,
  ShiftMarketplaceChannel,
  ShiftMarketplaceSale,
  ShiftMarketplaceStatus
} from "@/lib/types";

export const shiftMarketplaceChannels = [
  "talabat",
  "noon",
  "smiles",
  "keeta",
  "deliveroo"
] as const satisfies readonly ShiftMarketplaceChannel[];

export const shiftMarketplaceLabels: Record<ShiftMarketplaceChannel, string> = {
  talabat: "Talabat",
  noon: "Noon",
  smiles: "Smiles",
  keeta: "Keeta",
  deliveroo: "Deliveroo"
};

const shiftMarketplaceStatuses = ["entered", "zero", "unavailable"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMarketplaceChannel(value: unknown): value is ShiftMarketplaceChannel {
  return typeof value === "string" && shiftMarketplaceChannels.includes(
    value as ShiftMarketplaceChannel
  );
}

function isMarketplaceStatus(value: unknown): value is ShiftMarketplaceStatus {
  return typeof value === "string" && shiftMarketplaceStatuses.includes(
    value as ShiftMarketplaceStatus
  );
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export function configuredMarketplaceChannels(
  value: unknown
): ShiftMarketplaceChannel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter(isMarketplaceChannel))];
}

export function marketplaceSalesFromFormData(
  formData: FormData,
  channels: ShiftMarketplaceChannel[]
): { entries?: ShiftMarketplaceSale[]; error?: string } {
  const entries: ShiftMarketplaceSale[] = [];

  for (const channel of channels) {
    const statusValue = String(
      formData.get(`marketplace_${channel}_status`) ?? ""
    );

    if (!isMarketplaceStatus(statusValue)) {
      return { error: `Confirm the ${shiftMarketplaceLabels[channel]} total.` };
    }

    const note = String(
      formData.get(`marketplace_${channel}_note`) ?? ""
    ).trim().slice(0, 200);

    if (statusValue === "unavailable") {
      entries.push({
        channel,
        status: statusValue,
        order_count: null,
        gross_sales: null,
        note: note || null
      });
      continue;
    }

    if (statusValue === "zero") {
      entries.push({
        channel,
        status: statusValue,
        order_count: 0,
        gross_sales: 0,
        note: note || null
      });
      continue;
    }

    const salesRaw = String(
      formData.get(`marketplace_${channel}_gross_sales`) ?? ""
    ).trim();
    const countRaw = String(
      formData.get(`marketplace_${channel}_order_count`) ?? ""
    ).trim();
    const grossSales = finiteNumber(salesRaw);
    const orderCount = countRaw ? finiteNumber(countRaw) : null;

    if (
      !salesRaw ||
      grossSales === null ||
      grossSales < 0 ||
      grossSales > 99_999_999.99 ||
      (orderCount !== null && (!Number.isInteger(orderCount) || orderCount < 0))
    ) {
      return {
        error: `Enter a valid ${shiftMarketplaceLabels[channel]} sales total and order count.`
      };
    }

    entries.push({
      channel,
      status: statusValue,
      order_count: orderCount,
      gross_sales: grossSales,
      note: note || null
    });
  }

  return { entries };
}

export function reconciliationNeedsNote(differences: Array<number | null>) {
  return differences.some(
    (difference) => difference !== null && Math.abs(difference) >= 0.005
  );
}

function parseMarketplaceSales(value: unknown): ShiftMarketplaceSale[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsed: ShiftMarketplaceSale[] = [];
  const seen = new Set<ShiftMarketplaceChannel>();

  for (const item of value) {
    if (!isRecord(item) || !isMarketplaceChannel(item.channel) ||
        !isMarketplaceStatus(item.status) || seen.has(item.channel)) {
      return null;
    }

    const orderCount = item.order_count === null ? null : finiteNumber(item.order_count);
    const grossSales = item.gross_sales === null ? null : finiteNumber(item.gross_sales);

    if (item.order_count !== null && orderCount === null) {
      return null;
    }
    if (item.gross_sales !== null && grossSales === null) {
      return null;
    }

    seen.add(item.channel);
    parsed.push({
      channel: item.channel,
      status: item.status,
      order_count: orderCount,
      gross_sales: grossSales,
      note: nullableString(item.note)
    });
  }

  return parsed;
}

export function parseShiftCloseReportSnapshot(
  value: unknown
): ShiftCloseReportSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const strings = [
    "restaurant_id",
    "restaurant_name",
    "shift_id",
    "shift_name",
    "opened_at",
    "closed_at",
    "opened_by_user_id",
    "closed_by_user_id",
    "report_generated_at"
  ] as const;
  if (strings.some((key) => typeof value[key] !== "string" || !value[key])) {
    return null;
  }

  const numberKeys = [
    "schema_version",
    "report_version",
    "opening_cash_amount",
    "expected_cash_amount",
    "cash_counted_amount",
    "cash_difference_amount",
    "expected_card_amount",
    "card_terminal_total",
    "card_difference_amount",
    "expected_upi_amount",
    "completed_order_count",
    "completed_sales",
    "completed_cash_order_total",
    "cash_paid_out_total",
    "cancelled_order_count",
    "marketplace_sales_total",
    "combined_operational_sales"
  ] as const;
  const numbers = Object.fromEntries(
    numberKeys.map((key) => [key, finiteNumber(value[key])])
  ) as Record<(typeof numberKeys)[number], number | null>;
  if (numberKeys.some((key) => numbers[key] === null)) {
    return null;
  }

  const marketplaces = parseMarketplaceSales(value.marketplace_sales);
  const upiReported = value.upi_reported_total === null
    ? null
    : finiteNumber(value.upi_reported_total);
  const upiDifference = value.upi_difference_amount === null
    ? null
    : finiteNumber(value.upi_difference_amount);
  if (!marketplaces ||
      (value.upi_reported_total !== null && upiReported === null) ||
      (value.upi_difference_amount !== null && upiDifference === null)) {
    return null;
  }

  const countryCode: CountryCode | null = value.country_code === "AE" || value.country_code === "IN"
    ? value.country_code
    : null;
  if (!countryCode ||
      (value.currency_code !== "AED" && value.currency_code !== "INR") ||
      (value.time_zone !== "Asia/Dubai" && value.time_zone !== "Asia/Kolkata")) {
    return null;
  }

  return {
    schema_version: numbers.schema_version!,
    report_version: numbers.report_version!,
    restaurant_id: value.restaurant_id as string,
    restaurant_name: value.restaurant_name as string,
    country_code: countryCode,
    currency_code: value.currency_code,
    time_zone: value.time_zone,
    shift_id: value.shift_id as string,
    shift_name: value.shift_name as string,
    opened_at: value.opened_at as string,
    closed_at: value.closed_at as string,
    opened_by_user_id: value.opened_by_user_id as string,
    closed_by_user_id: value.closed_by_user_id as string,
    opening_note: nullableString(value.opening_note),
    closing_note: nullableString(value.closing_note),
    opening_cash_amount: numbers.opening_cash_amount!,
    expected_cash_amount: numbers.expected_cash_amount!,
    cash_counted_amount: numbers.cash_counted_amount!,
    cash_difference_amount: numbers.cash_difference_amount!,
    expected_card_amount: numbers.expected_card_amount!,
    card_terminal_total: numbers.card_terminal_total!,
    card_difference_amount: numbers.card_difference_amount!,
    expected_upi_amount: numbers.expected_upi_amount!,
    upi_reported_total: upiReported,
    upi_difference_amount: upiDifference,
    completed_order_count: numbers.completed_order_count!,
    completed_sales: numbers.completed_sales!,
    completed_cash_order_total: numbers.completed_cash_order_total!,
    cash_paid_out_total: numbers.cash_paid_out_total!,
    cancelled_order_count: numbers.cancelled_order_count!,
    fulfilment_breakdown: isRecord(value.fulfilment_breakdown)
      ? value.fulfilment_breakdown as ShiftFulfilmentSummary
      : {},
    marketplace_sales: marketplaces,
    marketplace_sales_total: numbers.marketplace_sales_total!,
    combined_operational_sales: numbers.combined_operational_sales!,
    report_generated_at: value.report_generated_at as string,
    correction_reason: nullableString(value.correction_reason)
  };
}
