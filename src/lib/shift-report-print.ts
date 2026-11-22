import {
  denominationTotalMinor,
  type CashDenominationCount
} from "@/lib/cash-denominations";
import { otherIncomeCategoryLabels } from "@/lib/business-day";
import { formatCurrency } from "@/lib/currency";
import { creditCollected, hasCreditActivity, salesByPayment } from "@/lib/shift-credit";
import {
  UNBILLED_SALE,
  cashSalesSplit,
  otherIncomeExcludingUnbilled,
  unbilledFromReport
} from "@/lib/unbilled-sales";
import {
  formatRestaurantShortDateTime,
  formatRestaurantTime,
  isSameRestaurantCalendarDay
} from "@/lib/date-time";
import { shiftMarketplaceLabels } from "@/lib/shift-reconciliation";
import type { ShiftCloseReportSnapshot } from "@/lib/types";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const fulfilmentLabels: Record<string, string> = {
  car_pickup: "Bring to My Car",
  delivery: "Delivery",
  dine_in: "Dine-in",
  takeaway: "Takeaway"
};

function differenceLabel(value: number) {
  if (Math.abs(value) < 0.005) {
    return "BALANCED";
  }

  return value > 0 ? "OVER" : "SHORT";
}

const isMaterial = (value: number | null | undefined) =>
  value !== null && value !== undefined && Math.abs(value) >= 0.005;

function moneyRow(label: string, value: string, className = "") {
  return `<div class="row ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

/** An indented detail line under the row it explains. */
function subRow(label: string, value: string, className = "") {
  return moneyRow(label, value, `sub ${className}`);
}

function denominationValue(minor: number) {
  return minor % 100 === 0 ? String(minor / 100) : (minor / 100).toFixed(2);
}

/** Notes and coins as a compact grid (denomination × count), then the total. */
function denominationRows(
  report: ShiftCloseReportSnapshot,
  denominations: CashDenominationCount[] | null | undefined,
  money: (value: number) => string
) {
  if (!denominations?.length) {
    return "";
  }

  const totalMinor = denominationTotalMinor(denominations);
  const matchesCount = totalMinor === Math.round(report.cash_counted_amount * 100);
  return `<div class="grid">${denominations.map((row) =>
      `<span>${escapeHtml(denominationValue(row.minor))}×${escapeHtml(row.count)}</span>`).join("")}</div>
    ${moneyRow("Notes & coins total", money(totalMinor / 100))}
    ${matchesCount ? "" : `<div class="explanation">As counted at close. The counted cash in this version was later corrected.</div>`}`;
}

function openingCheckRows(
  report: ShiftCloseReportSnapshot,
  money: (value: number) => string
) {
  const check = report.opening_check;
  if (!check || check.previous_cash_counted_amount === null || check.difference === null ||
      Math.abs(check.difference) < 0.005) {
    return "";
  }
  return `${subRow("Last close counted", money(check.previous_cash_counted_amount))}
    ${subRow(`Opening ${check.difference > 0 ? "more" : "less"} by`, money(Math.abs(check.difference)), "attention")}
    ${check.reason ? `<div class="note">${escapeHtml(check.reason)}</div>` : ""}`;
}

/** One line when the terminal agrees; the full working when it does not. */
function reconciliationSection(
  name: string,
  expected: number,
  reported: number,
  difference: number,
  reportedLabel: string,
  money: (value: number) => string
) {
  if (!isMaterial(difference)) {
    return `<section>${moneyRow(`${name} = ${reportedLabel.toLowerCase()} · balanced`, money(reported))}</section>`;
  }
  return `<section>
      <h2>${escapeHtml(name.toUpperCase())} RECONCILIATION</h2>
      ${moneyRow(`Expected ${name === "UPI" ? name : name.toLowerCase()} receipts`, money(expected))}
      ${moneyRow(`${reportedLabel} total`, money(reported))}
      ${moneyRow(differenceLabel(difference), money(Math.abs(difference)), "difference")}
    </section>`;
}

function creditSection(
  report: ShiftCloseReportSnapshot,
  money: (value: number) => string
) {
  const collected = creditCollected(report);
  // Credit sold already shows under sales by payment; a separate block only
  // earns its paper when credit was also collected.
  if (!hasCreditActivity(report) || !isMaterial(collected.total)) {
    return "";
  }
  const payments = salesByPayment(report);
  // Counts and totals only: customer names never go on paper.
  return `<section>
      <h2>CUSTOMER CREDIT</h2>
      ${report.credit_sales
        ? moneyRow(`Sold on credit (${report.credit_sales.length})`, money(payments.credit ?? 0))
        : ""}
      ${moneyRow("Credit collected", money(collected.total))}
      ${Object.entries(collected.byMethod).map(([method, amount]) =>
        subRow(`by ${method.replace("_", " ")}`, money(amount))).join("")}
      ${report.credit_sales
        ? moneyRow("Change in amount owed", money((payments.credit ?? 0) - collected.total), "total")
        : ""}
    </section>`;
}

export function renderShiftCloseThermalReport(
  report: ShiftCloseReportSnapshot,
  options: { cashDenominations?: CashDenominationCount[] | null } = {}
) {
  const money = (value: number) => formatCurrency(value, report);
  // Unbilled sales are stored as receipts but printed as sales.
  const unbilled = unbilledFromReport(report);
  const otherIncome = otherIncomeExcludingUnbilled(report, unbilled);
  const cashSales = cashSalesSplit(report.completed_cash_order_total, unbilled);
  const dateTime = (value: string) => formatRestaurantShortDateTime(value, report);
  const shiftWindow = isSameRestaurantCalendarDay(report.opened_at, report.closed_at, report)
    ? `${dateTime(report.opened_at)} → ${formatRestaurantTime(report.closed_at, report)}`
    : `${dateTime(report.opened_at)} → ${dateTime(report.closed_at)}`;
  const cashDifference = report.cash_difference_amount;
  const cardDifference = report.card_difference_amount;
  const upiDifference = report.upi_difference_amount;
  const hasUnavailableMarketplace = report.marketplace_sales.some(
    (sale) => sale.status === "unavailable"
  );
  const hasDifference = [cashDifference, cardDifference, upiDifference].some(isMaterial);
  const needsAttention = hasDifference || hasUnavailableMarketplace;

  const paidOuts = report.paid_outs?.filter((paidOut) => !paidOut.voided_at) ?? [];
  const voidedPaidOuts = report.paid_outs?.filter((paidOut) => paidOut.voided_at).length ?? 0;
  const unbilledEntries = report.other_income_entries
    ?.filter((entry) => !entry.voided_at && entry.category === UNBILLED_SALE) ?? [];
  const incomeEntries = report.other_income_entries
    ?.filter((entry) => !entry.voided_at && entry.category !== UNBILLED_SALE) ?? [];

  const payments = salesByPayment(report);
  const paymentRows = [
    subRow("Cash", money(payments.cash)),
    subRow("Card", money(payments.card)),
    report.country_code === "IN" ? subRow("UPI", money(payments.upi)) : "",
    isMaterial(payments.credit)
      ? subRow(`Customer credit${report.credit_sales ? ` (${report.credit_sales.length})` : ""}`, money(payments.credit ?? 0))
      : "",
    payments.remainder !== 0
      ? subRow(payments.credit === null ? "Credit / not recorded" : "Not recorded", money(payments.remainder), "attention")
      : ""
  ].join("");

  // Platforms with sales, or that need attention, get a line each; the
  // confirmed zeros share one line.
  const listedPlatforms = report.marketplace_sales.filter((sale) => sale.status !== "zero");
  const zeroPlatforms = report.marketplace_sales.filter((sale) => sale.status === "zero");
  const platformRows = `${listedPlatforms.map((sale) => {
      const label = shiftMarketplaceLabels[sale.channel];
      if (sale.status === "unavailable") {
        return `${moneyRow(label, "UNAVAILABLE", "attention")}
          ${sale.note ? `<div class="note">${escapeHtml(sale.note)}</div>` : ""}`;
      }
      const orders = sale.order_count === null
        ? "orders not entered"
        : `${sale.order_count} order${sale.order_count === 1 ? "" : "s"}`;
      return `${moneyRow(`${label} (${orders})`, money(sale.gross_sales ?? 0))}
        ${sale.note ? `<div class="note">${escapeHtml(sale.note)}</div>` : ""}`;
    }).join("")}
    ${zeroPlatforms.length
      ? `<div class="note">${escapeHtml(zeroPlatforms.map((sale) => shiftMarketplaceLabels[sale.channel]).join(", "))}: confirmed zero</div>`
      : ""}`;

  const combinedSales = report.combined_operational_sales + unbilled.total;
  // Other income and total receipts only print when they add something to
  // combined sales; itemized income always prints.
  const receiptsDiffer = incomeEntries.length > 0 || isMaterial(otherIncome.total) ||
    report.credit_repayment_total > 0 ||
    isMaterial(report.combined_operational_receipts - combinedSales);

  const fulfilmentEntries = Object.entries(report.fulfilment_breakdown)
    .filter(([, values]) => (values?.orders ?? 0) > 0 || Number(values?.sales ?? 0) !== 0);
  const orderRows = report.completed_order_count === 0
    ? '<div class="note">No completed orders.</div>'
    : fulfilmentEntries.length === 1
      ? moneyRow(
          `Orders (${fulfilmentLabels[fulfilmentEntries[0][0]] ?? fulfilmentEntries[0][0]})`,
          String(report.completed_order_count)
        )
      : `${moneyRow("Completed orders", String(report.completed_order_count))}
        ${fulfilmentEntries.map(([type, values]) => subRow(
          fulfilmentLabels[type] ?? type,
          `${values?.orders ?? 0} · ${money(Number(values?.sales ?? 0))}`
        )).join("")}`;

  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeHtml(report.restaurant_name)} shift ${escapeHtml(report.shift_id.slice(-8))}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; background: #fff; color: #000; }
          body { width: 80mm; padding: 2mm 4mm; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.2; }
          header { padding-bottom: 1.5mm; text-align: center; }
          h1 { margin: 0; font-size: 17px; line-height: 1.1; }
          .title { font-size: 12px; font-weight: 900; }
          .meta { margin-top: 1mm; font-size: 10px; }
          .status { border: 2px solid #000; margin: 0 0 1.5mm; padding: 1.2mm; text-align: center; font-size: 13px; font-weight: 900; }
          section { border-top: 1px dashed #000; padding: 1.5mm 0; }
          h2 { margin: 0 0 .8mm; font-size: 11.5px; }
          .row { display: flex; align-items: baseline; justify-content: space-between; gap: 3mm; padding: .3mm 0; break-inside: avoid; }
          .row span { min-width: 0; overflow-wrap: anywhere; }
          .row strong { flex-shrink: 0; text-align: right; }
          .sub { padding-left: 3mm; font-size: 10px; }
          .sub strong { font-weight: 400; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 2mm; padding: .5mm 0 .5mm 3mm; font-size: 10.5px; }
          .total { border-top: 1px solid #000; margin-top: .6mm; padding-top: .8mm; font-size: 11.5px; }
          .grand { border-top: 2px solid #000; margin-top: .6mm; padding-top: .8mm; font-size: 13px; }
          .difference { margin-top: .6mm; border: 1px solid #000; padding: .8mm 1.2mm; font-size: 12px; }
          .attention, .attention strong { font-weight: 900; }
          .note { padding: 0 0 .5mm 3mm; font-size: 10px; overflow-wrap: anywhere; }
          .explanation { margin: .5mm 0 0; font-size: 9px; }
          footer { border-top: 2px dashed #000; padding-top: 1.5mm; text-align: center; font-size: 9px; }
          .signature { margin: 4mm 0 2mm; text-align: left; font-size: 10px; }
          @media screen { body { margin: 12px auto; box-shadow: 0 0 16px rgba(0,0,0,.18); } }
        </style>
      </head>
      <body>
        <header>
          <h1>${escapeHtml(report.restaurant_name)}</h1>
          <div class="title">SHIFT CLOSE SUMMARY</div>
          <div class="meta">
            <strong>${escapeHtml(report.shift_name)}</strong> · Version ${escapeHtml(report.report_version)}<br>
            ${escapeHtml(shiftWindow)}
          </div>
        </header>

        <div class="status">${needsAttention ? "*** ACTION REQUIRED ***" : "SHIFT BALANCED — OK"}</div>

        <section>
          <h2>CASH DRAWER</h2>
          ${moneyRow("Opening cash", money(report.opening_cash_amount))}
          ${openingCheckRows(report, money)}
          ${moneyRow("Total cash sales", money(cashSales.total))}
          ${cashSales.unbilled > 0
            ? subRow("Billed (orders)", money(cashSales.billed)) + subRow("Unbilled", money(cashSales.unbilled))
            : ""}
          ${otherIncome.cash > 0 ? moneyRow("Cash other income", money(otherIncome.cash)) : ""}
          ${isMaterial(report.cash_paid_out_total) || paidOuts.length
            ? moneyRow("Cash paid-outs", `-${money(report.cash_paid_out_total)}`)
            : ""}
          ${paidOuts.map((paidOut) => subRow(paidOut.reason, money(paidOut.amount))).join("")}
          ${voidedPaidOuts ? `<div class="explanation">${voidedPaidOuts} voided paid-out${voidedPaidOuts === 1 ? "" : "s"} not counted.</div>` : ""}
          ${moneyRow("Expected cash", money(report.expected_cash_amount), "total")}
          ${moneyRow("Counted cash", money(report.cash_counted_amount))}
          ${moneyRow(differenceLabel(cashDifference), money(Math.abs(cashDifference)), "difference")}
          ${denominationRows(report, options.cashDenominations, money)}
        </section>

        ${reconciliationSection("Card", report.expected_card_amount, report.card_terminal_total,
          cardDifference, "Terminal", money)}

        ${report.country_code === "IN"
          ? reconciliationSection("UPI", report.expected_upi_amount, report.upi_reported_total ?? 0,
              upiDifference ?? 0, "Reported", money)
          : ""}

        <section>
          <h2>SALES</h2>
          ${moneyRow("WhatsOrder sales", money(report.completed_sales))}
          ${paymentRows}
          ${unbilled.total > 0 ? moneyRow("Unbilled sales (no order)", money(unbilled.total), "attention") : ""}
          ${unbilledEntries.map((entry) => subRow(
            `${entry.description} (${entry.payment_method})`,
            money(entry.amount)
          )).join("")}
          ${platformRows}
          ${moneyRow("Combined sales", money(combinedSales), "grand")}
          ${receiptsDiffer ? `
            ${moneyRow("Other income", money(otherIncome.total))}
            ${incomeEntries.map((entry) => subRow(
              entry.category === "customer_credit_repayment"
                // No customer names on paper; the label says what it is.
                ? otherIncomeCategoryLabels.customer_credit_repayment
                : `${otherIncomeCategoryLabels[entry.category as keyof typeof otherIncomeCategoryLabels] ?? entry.category}: ${entry.description}`,
              money(entry.amount)
            )).join("")}
            ${report.credit_repayment_total > 0 ? moneyRow("Less credit repayments (already in sales)", money(report.credit_repayment_total)) : ""}
            ${moneyRow("Total receipts", money(report.combined_operational_receipts), "grand")}` : ""}
          ${listedPlatforms.some((sale) => sale.status === "entered")
            ? '<p class="explanation">Marketplace = manually reported gross sales, not settlement.</p>'
            : ""}
        </section>

        ${creditSection(report, money)}

        <section>
          ${orderRows}
          ${report.cancelled_order_count > 0
            ? moneyRow("Cancelled in shift window", String(report.cancelled_order_count), "attention")
            : ""}
          ${report.opening_note ? `<div class="note"><strong>Opening:</strong> ${escapeHtml(report.opening_note)}</div>` : ""}
          ${report.closing_note ? `<div class="note"><strong>Closing:</strong> ${escapeHtml(report.closing_note)}</div>` : ""}
          ${report.correction_reason ? `<div class="note"><strong>Correction:</strong> ${escapeHtml(report.correction_reason)}</div>` : ""}
        </section>

        <footer>
          <div class="signature">Shift manager signature: ____________________</div>
          Report ${escapeHtml(report.shift_id.slice(-8).toUpperCase())}-V${escapeHtml(report.report_version)} · Generated ${escapeHtml(dateTime(report.report_generated_at))}
        </footer>
      </body>
    </html>`;
}
