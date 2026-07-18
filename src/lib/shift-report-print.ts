import { formatCurrency } from "@/lib/currency";
import { formatRestaurantShortDateTime } from "@/lib/date-time";
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

function moneyRow(label: string, value: string, className = "") {
  return `<div class="row ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

export function renderShiftCloseThermalReport(report: ShiftCloseReportSnapshot) {
  const money = (value: number) => formatCurrency(value, report);
  const dateTime = (value: string) => formatRestaurantShortDateTime(value, report);
  const cashDifference = report.cash_difference_amount;
  const cardDifference = report.card_difference_amount;
  const upiDifference = report.upi_difference_amount;
  const hasUnavailableMarketplace = report.marketplace_sales.some(
    (sale) => sale.status === "unavailable"
  );
  const hasDifference = [cashDifference, cardDifference, upiDifference].some(
    (value) => value !== null && Math.abs(value) >= 0.005
  );
  const needsAttention = hasDifference || hasUnavailableMarketplace;

  const marketplaces = report.marketplace_sales.length
    ? `<section>
        <h2>DELIVERY PLATFORMS</h2>
        ${report.marketplace_sales.map((sale) => {
          const status = sale.status === "unavailable"
            ? "UNAVAILABLE"
            : sale.status === "zero"
              ? "Confirmed zero"
              : [
                  sale.order_count === null
                    ? "Orders not entered"
                    : `${sale.order_count} order${sale.order_count === 1 ? "" : "s"}`,
                  money(sale.gross_sales ?? 0)
                ].join(" · ");
          return `${moneyRow(shiftMarketplaceLabels[sale.channel], status, sale.status === "unavailable" ? "attention" : "")}
            ${sale.note ? `<div class="note">${escapeHtml(sale.note)}</div>` : ""}`;
        }).join("")}
        ${moneyRow("Marketplace total", money(report.marketplace_sales_total), "total")}
      </section>`
    : "";

  const fulfilment = Object.entries(report.fulfilment_breakdown)
    .map(([type, values]) => moneyRow(
      fulfilmentLabels[type] ?? type,
      `${values?.orders ?? 0} · ${money(Number(values?.sales ?? 0))}`
    ))
    .join("");

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
          body { width: 80mm; padding: 3mm 4mm; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.3; }
          header { padding-bottom: 3mm; text-align: center; }
          h1 { margin: 0; font-size: 19px; line-height: 1.15; }
          .title { margin-top: 1mm; font-size: 13px; font-weight: 900; }
          .meta { margin-top: 2mm; font-size: 10px; }
          .status { border: 2px solid #000; margin: 0 0 3mm; padding: 2mm; text-align: center; font-size: 14px; font-weight: 900; }
          section { border-top: 1px dashed #000; padding: 2.5mm 0; break-inside: avoid; page-break-inside: avoid; }
          h2 { margin: 0 0 1.5mm; font-size: 12px; }
          h3 { margin: 2mm 0 1mm; font-size: 11px; }
          .row { display: flex; align-items: baseline; justify-content: space-between; gap: 3mm; padding: .7mm 0; }
          .row span { min-width: 0; overflow-wrap: anywhere; }
          .row strong { flex-shrink: 0; text-align: right; }
          .total { border-top: 1px solid #000; margin-top: 1mm; padding-top: 1.5mm; font-size: 12px; }
          .grand { border-top: 2px solid #000; margin-top: 1mm; padding-top: 1.5mm; font-size: 14px; }
          .difference { margin-top: 1mm; border: 1px solid #000; padding: 1.5mm; font-size: 12px; }
          .attention { font-weight: 900; }
          .note { padding: 0 0 1mm 2mm; font-size: 10px; overflow-wrap: anywhere; }
          .explanation { margin: 1mm 0 0; font-size: 9px; }
          footer { border-top: 2px dashed #000; padding-top: 2.5mm; text-align: center; font-size: 9px; }
          .signature { margin: 5mm 0 3mm; text-align: left; font-size: 10px; }
          @media screen { body { margin: 12px auto; box-shadow: 0 0 16px rgba(0,0,0,.18); } }
        </style>
      </head>
      <body>
        <header>
          <h1>${escapeHtml(report.restaurant_name)}</h1>
          <div class="title">SHIFT CLOSE SUMMARY</div>
          <div class="meta">
            <strong>${escapeHtml(report.shift_name)}</strong> · Version ${escapeHtml(report.report_version)}<br>
            Opened ${escapeHtml(dateTime(report.opened_at))}<br>
            Closed ${escapeHtml(dateTime(report.closed_at))}
          </div>
        </header>

        <div class="status">${needsAttention ? "*** ACTION REQUIRED ***" : "SHIFT BALANCED — OK"}</div>

        <section>
          <h2>CASH DRAWER</h2>
          ${moneyRow("Opening cash", money(report.opening_cash_amount))}
          ${moneyRow("Cash sales", money(report.completed_cash_order_total))}
          ${moneyRow("Cash paid-outs", `-${money(report.cash_paid_out_total)}`)}
          ${moneyRow("Expected cash", money(report.expected_cash_amount), "total")}
          ${moneyRow("Counted cash", money(report.cash_counted_amount))}
          ${moneyRow(differenceLabel(cashDifference), money(Math.abs(cashDifference)), "difference")}
        </section>

        <section>
          <h2>CARD RECONCILIATION</h2>
          ${moneyRow("WhatsOrder card", money(report.expected_card_amount))}
          ${moneyRow("Terminal total", money(report.card_terminal_total))}
          ${moneyRow(differenceLabel(cardDifference), money(Math.abs(cardDifference)), "difference")}
        </section>

        ${report.country_code === "IN" ? `<section>
          <h2>UPI RECONCILIATION</h2>
          ${moneyRow("WhatsOrder UPI", money(report.expected_upi_amount))}
          ${moneyRow("Reported total", money(report.upi_reported_total ?? 0))}
          ${moneyRow(differenceLabel(upiDifference ?? 0), money(Math.abs(upiDifference ?? 0)), "difference")}
        </section>` : ""}

        <section>
          <h2>SALES SUMMARY</h2>
          ${moneyRow("WhatsOrder sales", money(report.completed_sales))}
          ${moneyRow("Marketplace sales", money(report.marketplace_sales_total))}
          ${moneyRow("Combined sales", money(report.combined_operational_sales), "grand")}
          <p class="explanation">Marketplace figures are manually reported gross sales, not settlement figures.</p>
        </section>

        ${marketplaces}

        <section>
          <h2>ORDER ACTIVITY</h2>
          ${moneyRow("Completed orders", String(report.completed_order_count))}
          ${moneyRow("Cancelled in shift window", String(report.cancelled_order_count))}
          ${fulfilment || '<div class="note">No completed orders.</div>'}
        </section>

        ${report.opening_note || report.closing_note || report.correction_reason ? `<section>
          <h2>NOTES / EXCEPTIONS</h2>
          ${report.opening_note ? `<div class="note"><strong>Opening:</strong> ${escapeHtml(report.opening_note)}</div>` : ""}
          ${report.closing_note ? `<div class="note"><strong>Closing:</strong> ${escapeHtml(report.closing_note)}</div>` : ""}
          ${report.correction_reason ? `<div class="note"><strong>Correction:</strong> ${escapeHtml(report.correction_reason)}</div>` : ""}
        </section>` : ""}

        <footer>
          <div class="signature">Shift manager signature: ____________________</div>
          Report ${escapeHtml(report.shift_id.slice(-8).toUpperCase())}-V${escapeHtml(report.report_version)}<br>
          Generated ${escapeHtml(dateTime(report.report_generated_at))}<br>
          Digital report retained in WhatsOrder
        </footer>
      </body>
    </html>`;
}
