import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import {
  ShiftReportActions,
  ShiftReportCorrectionForm
} from "@/components/admin/ShiftReportActions";
import { formatCurrency } from "@/lib/currency";
import { formatRestaurantShortDateTime } from "@/lib/date-time";
import { getShiftCloseReportView } from "@/lib/shift-data";
import { shiftMarketplaceLabels } from "@/lib/shift-reconciliation";
import { requireRestaurantAdmin } from "@/lib/super-admin-auth";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { otherIncomeCategoryLabels } from "@/lib/business-day";
import type { ShiftCloseReportSnapshot } from "@/lib/types";

const fulfilmentLabels: Record<string, string> = {
  car_pickup: "Bring to My Car",
  delivery: "Delivery",
  dine_in: "Dine-in",
  takeaway: "Takeaway"
};

function ReportValue({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warning";
}) {
  return (
    <div className={`rounded-lg p-3 ${
      tone === "good"
        ? "bg-emerald-50"
        : tone === "warning"
          ? "bg-amber-50"
          : "bg-stone-50"
    }`}>
      <dt className="text-xs font-bold uppercase tracking-wide text-stone-500">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-black">{value}</dd>
    </div>
  );
}

function DifferenceValue({
  label,
  report,
  value
}: {
  label: string;
  report: ShiftCloseReportSnapshot;
  value: number | null;
}) {
  if (value === null) {
    return null;
  }

  return (
    <ReportValue
      label={label}
      tone={value === 0 ? "good" : "warning"}
      value={formatCurrency(value, report)}
    />
  );
}

export default async function ShiftCloseReportPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string; version?: string }>;
}) {
  const [session, { id }, query] = await Promise.all([
    requireRestaurantAdmin(),
    params,
    searchParams
  ]);
  const view = await getShiftCloseReportView(session, id);

  if (!view) {
    notFound();
  }

  if (view.reports.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link className="focus-ring inline-flex items-center gap-2 text-sm font-black text-leaf" href="/admin/shifts">
          <ArrowLeft size={16} /> Back to shifts
        </Link>
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <h1 className="text-xl font-black">No immutable report for this shift</h1>
          <p className="mt-2 text-sm leading-6">
            This shift was closed before automatic close reports were introduced.
          </p>
        </div>
      </main>
    );
  }

  const requestedVersion = Number(query.version);
  const selected = Number.isInteger(requestedVersion)
    ? view.reports.find((report) => report.version === requestedVersion)
    : view.reports[0];
  if (!selected) {
    notFound();
  }

  const report = selected.snapshot;
  const latestReport = view.reports[0].snapshot;
  const money = (value: number) => formatCurrency(value, report);
  const dateTime = (value: string) => formatRestaurantShortDateTime(value, report);
  const ownerPhone = session.restaurant.owner_phone;
  const shareUrl = ownerPhone
    ? buildWhatsAppUrl(
        ownerPhone,
        `${report.restaurant_name} — ${report.shift_name} closed\n` +
          `${dateTime(report.closed_at)}\n` +
          `WhatsOrder sales: ${money(report.completed_sales)}\n` +
          `Marketplace sales: ${money(report.marketplace_sales_total)}\n` +
          `Combined operational sales: ${money(report.combined_operational_sales)}\n` +
          `Other income: ${money(report.other_income_total)}\n` +
          `Total operational receipts: ${money(report.combined_operational_receipts)}\n` +
          `Cash difference: ${money(report.cash_difference_amount)}\n` +
          `Card difference: ${money(report.card_difference_amount)}`,
        session.restaurant.phone_country_code
      )
    : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 print:max-w-none print:px-0 print:py-0">
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <Link className="focus-ring inline-flex items-center gap-2 text-sm font-black text-leaf" href="/admin/shifts">
          <ArrowLeft size={16} /> Back to shifts
        </Link>
        <ShiftReportActions
          autoPrintThermal={query.print === "thermal"}
          report={report}
          shareUrl={shareUrl}
        />
      </div>

      <article className="mt-5 rounded-lg border border-stone-200 bg-white p-5 shadow-sm print:mt-0 print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-stone-200 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-leaf">
                Shift close report
              </p>
              <h1 className="mt-1 text-3xl font-black">{report.restaurant_name}</h1>
              <p className="mt-1 text-lg font-bold text-stone-600">{report.shift_name}</p>
            </div>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black uppercase tracking-wide">
              Version {report.report_version}
            </span>
          </div>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-stone-500">Opened</dt><dd className="font-bold">{dateTime(report.opened_at)}</dd></div>
            <div><dt className="text-stone-500">Closed</dt><dd className="font-bold">{dateTime(report.closed_at)}</dd></div>
          </dl>
          {report.correction_reason ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-black">Corrected report</p>
              <p className="mt-1">{report.correction_reason}</p>
            </div>
          ) : null}
        </header>

        <section className="mt-5">
          <h2 className="text-lg font-black">Operational sales</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <ReportValue label="WhatsOrder sales" value={money(report.completed_sales)} />
            <ReportValue label="Marketplace sales" value={money(report.marketplace_sales_total)} />
            <ReportValue label="Combined sales" tone="good" value={money(report.combined_operational_sales)} />
          </dl>
          <p className="mt-2 text-xs text-stone-500">
            Combined sales include manually reported marketplace gross sales and are not accounting or settlement figures.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-black">Other income</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <ReportValue label="Other income" value={money(report.other_income_total)} />
            <ReportValue label="Cash other income" value={money(report.cash_other_income_total)} />
            <ReportValue label="Total operational receipts" tone="good" value={money(report.combined_operational_receipts)} />
          </dl>
          {Object.keys(report.other_income_breakdown).length ? (
            <div className="mt-3 rounded-lg bg-stone-50 p-3 text-sm">
              {Object.entries(report.other_income_breakdown).map(([category, amount]) => (
                <p className="flex justify-between gap-3 py-1" key={category}>
                  <span>{otherIncomeCategoryLabels[category as keyof typeof otherIncomeCategoryLabels] ?? category}</span>
                  <span className="font-bold">{money(Number(amount))}</span>
                </p>
              ))}
            </div>
          ) : <p className="mt-2 text-sm text-stone-500">No non-sales income was recorded.</p>}
        </section>

        <section className="mt-6">
          <h2 className="text-lg font-black">Reconciliation</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-3">
            <div>
              <h3 className="text-sm font-black">Cash</h3>
              <dl className="mt-2 space-y-2">
                <ReportValue label="Expected" value={money(report.expected_cash_amount)} />
                <ReportValue label="Counted" value={money(report.cash_counted_amount)} />
                <DifferenceValue label="Difference" report={report} value={report.cash_difference_amount} />
              </dl>
            </div>
            <div>
              <h3 className="text-sm font-black">Card</h3>
              <dl className="mt-2 space-y-2">
                <ReportValue label="Expected receipts" value={money(report.expected_card_amount)} />
                <ReportValue label="Terminal" value={money(report.card_terminal_total)} />
                <DifferenceValue label="Difference" report={report} value={report.card_difference_amount} />
              </dl>
            </div>
            {report.country_code === "IN" ? (
              <div>
                <h3 className="text-sm font-black">UPI</h3>
                <dl className="mt-2 space-y-2">
                  <ReportValue label="Expected receipts" value={money(report.expected_upi_amount)} />
                  <ReportValue label="Reported" value={money(report.upi_reported_total ?? 0)} />
                  <DifferenceValue label="Difference" report={report} value={report.upi_difference_amount} />
                </dl>
              </div>
            ) : null}
          </div>
        </section>

        {report.marketplace_sales.length > 0 ? (
          <section className="mt-6">
            <h2 className="text-lg font-black">Delivery platforms</h2>
            <div className="mt-3 overflow-hidden rounded-lg border border-stone-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                  <tr><th className="px-3 py-2">Platform</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Orders</th><th className="px-3 py-2">Gross sales</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {report.marketplace_sales.map((sale) => (
                    <tr key={sale.channel}>
                      <td className="px-3 py-2 font-black">{shiftMarketplaceLabels[sale.channel]}</td>
                      <td className="px-3 py-2">
                        {sale.status === "entered" ? "Entered" : sale.status === "zero" ? "Confirmed zero" : "Unavailable"}
                        {sale.note ? <p className="text-xs text-stone-500">{sale.note}</p> : null}
                      </td>
                      <td className="px-3 py-2">{sale.order_count ?? "—"}</td>
                      <td className="px-3 py-2 font-bold">{sale.gross_sales === null ? "Unverified" : money(sale.gross_sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.marketplace_sales.some((sale) => sale.status === "unavailable") ? (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs font-bold text-amber-900">
                <AlertTriangle className="mt-0.5 shrink-0" size={15} />
                One or more platform totals were unavailable and are excluded from combined sales.
              </p>
            ) : null}
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="text-lg font-black">Shift activity</h2>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <ReportValue label="Completed orders" value={String(report.completed_order_count)} />
              <ReportValue label="Cancelled" value={String(report.cancelled_order_count)} />
              <ReportValue label="Cash orders" value={money(report.completed_cash_order_total)} />
              <ReportValue label="Cash paid-outs" value={money(report.cash_paid_out_total)} />
            </dl>
          </div>
          <div>
            <h2 className="text-lg font-black">Fulfilment</h2>
            <div className="mt-3 rounded-lg bg-stone-50 p-3 text-sm">
              {Object.entries(report.fulfilment_breakdown).length > 0 ? Object.entries(report.fulfilment_breakdown).map(([type, values]) => (
                <p className="flex justify-between gap-3 py-1" key={type}>
                  <span>{fulfilmentLabels[type] ?? type}</span>
                  <span className="font-bold">{values?.orders ?? 0} · {money(Number(values?.sales ?? 0))}</span>
                </p>
              )) : <p className="text-stone-500">No completed orders.</p>}
            </div>
          </div>
        </section>

        {report.opening_note || report.closing_note ? (
          <section className="mt-6 border-t border-stone-200 pt-4">
            <h2 className="text-lg font-black">Notes</h2>
            {report.opening_note ? <p className="mt-2 text-sm"><strong>Opening:</strong> {report.opening_note}</p> : null}
            {report.closing_note ? <p className="mt-2 text-sm"><strong>Closing:</strong> {report.closing_note}</p> : null}
          </section>
        ) : null}
        <footer className="mt-6 border-t border-stone-200 pt-3 text-xs text-stone-500">
          Report generated {dateTime(report.report_generated_at)} · Shift ID {report.shift_id}
        </footer>
      </article>

      {view.reports.length > 1 ? (
        <nav aria-label="Report versions" className="mt-4 flex flex-wrap gap-2 print:hidden">
          {view.reports.map((version) => (
            <Link
              className={`focus-ring rounded-lg px-3 py-2 text-xs font-black ${version.version === selected.version ? "bg-ink text-white" : "border border-stone-200 bg-white"}`}
              href={`/admin/shifts/${id}/report?version=${version.version}`}
              key={version.id}
            >
              Version {version.version}
            </Link>
          ))}
        </nav>
      ) : null}

      {view.canCorrect ? (
        <div className="mt-5">
          <ShiftReportCorrectionForm key={latestReport.report_version} report={latestReport} />
        </div>
      ) : null}
    </main>
  );
}
