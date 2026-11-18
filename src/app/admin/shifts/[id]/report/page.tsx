import { LateShiftReceipts } from "@/components/admin/LateShiftReceipts";
import { getLateShiftReceipts } from "@/lib/shift-data";
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
import { otherIncomeCategoryLabels, otherIncomePaymentLabels } from "@/lib/business-day";
import type { ShiftCloseReportSnapshot } from "@/lib/types";
import { getPaidOutBillStatuses } from "@/lib/finance-paid-out-data";
import { PaidOutBillBadge } from "@/components/admin/PaidOutBillBadge";
import { VoidPaidOutForm } from "@/components/admin/ShiftForms";
import { getClosedShiftPaidOuts, getReportCustomerNames } from "@/lib/shift-data";
import { creditCollected, hasCreditActivity, salesByPayment } from "@/lib/shift-credit";

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

  const [lateReceipts, shiftPaidOuts] = await Promise.all([
    getLateShiftReceipts(session, id),
    getClosedShiftPaidOuts(session, id)
  ]);
  // Live Finance status, shown outside the immutable report snapshot.
  const paidOutBillStatuses = await getPaidOutBillStatuses(
    session,
    shiftPaidOuts.paidOuts.filter((paidOut) => !paidOut.voided_at).map((paidOut) => paidOut.id)
  ).catch(() => null);
  const canVoidPaidOuts = view.canCorrect && !shiftPaidOuts.businessDayClosed;

  if (view.reports.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link className="focus-ring inline-flex items-center gap-2 text-sm font-black text-leaf" href="/admin/shifts">
          <ArrowLeft size={16} /> Back to shifts
        </Link>
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <h1 className="text-xl font-black">No immutable report for this shift</h1>
          <LateShiftReceipts receipts={lateReceipts} restaurant={session.restaurant} />
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
  const payments = salesByPayment(report);
  const collected = creditCollected(report);
  const showCredit = hasCreditActivity(report);
  // Names are looked up now, per tenant, for management only; reports store IDs.
  const customerNames = await getReportCustomerNames(session, [
    ...(report.credit_sales ?? []).map((sale) => sale.customer_id),
    ...(report.other_income_entries ?? []).map((entry) => entry.customer_id)
  ]);
  const customerLabel = (customerId: string | null) =>
    (customerId && customerNames.get(customerId)) || "Credit customer";
  const ownerPhone = session.owner.owner_phone;
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
      <LateShiftReceipts receipts={lateReceipts} restaurant={session.restaurant} />
      <div className="flex flex-col gap-4 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <Link className="focus-ring inline-flex items-center gap-2 text-sm font-black text-leaf" href="/admin/shifts">
          <ArrowLeft size={16} /> Back to shifts
        </Link>
        <ShiftReportActions
          autoPrintThermal={query.print === "thermal"}
          cashDenominations={view.cashDenominations}
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
          <h2 className="text-lg font-black">WhatsOrder sales by payment</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-4">
            <ReportValue label="Cash" value={money(payments.cash)} />
            <ReportValue label="Card" value={money(payments.card)} />
            {report.country_code === "IN" ? <ReportValue label="UPI" value={money(payments.upi)} /> : null}
            {payments.credit !== null ? (
              <ReportValue label="Customer credit" value={money(payments.credit)} />
            ) : null}
            {payments.remainder !== 0 ? (
              <ReportValue
                label={payments.credit === null ? "Credit or not recorded" : "Payment not recorded"}
                tone="warning"
                value={money(payments.remainder)}
              />
            ) : null}
          </dl>
          <p className="mt-2 text-xs text-stone-500">
            These add up to WhatsOrder sales ({money(report.completed_sales)}).
            {payments.credit === null && payments.remainder !== 0
              ? " This report was saved before credit sales were recorded separately."
              : ""}
          </p>
        </section>

        {showCredit ? (
          <section className="mt-6">
            <h2 className="text-lg font-black">Customer credit</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
              {report.credit_sales ? (
                <ReportValue
                  label={`Sold on credit (${report.credit_sales.length})`}
                  value={money(payments.credit ?? 0)}
                />
              ) : null}
              <ReportValue label="Credit collected" value={money(collected.total)} />
              {report.credit_sales ? (
                <ReportValue
                  label="Change in amount owed"
                  tone={(payments.credit ?? 0) - collected.total > 0.005 ? "warning" : "default"}
                  value={money((payments.credit ?? 0) - collected.total)}
                />
              ) : null}
            </dl>
            {Object.keys(collected.byMethod).length ? (
              <p className="mt-2 text-xs text-stone-500">
                Collected by{" "}
                {Object.entries(collected.byMethod)
                  .map(([method, amount]) => `${otherIncomePaymentLabels[method as keyof typeof otherIncomePaymentLabels] ?? method} ${money(amount)}`)
                  .join(" · ")}
                . Cash collected is already in expected cash.
              </p>
            ) : null}
            {report.credit_sales?.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {report.credit_sales.map((sale) => (
                  <li className="flex justify-between gap-3 rounded-lg bg-stone-50 p-3" key={sale.order_id}>
                    <span className="min-w-0">
                      <span className="block break-words font-bold">
                        {view.canCorrect ? customerLabel(sale.customer_id) : "Credit sale"}
                      </span>
                      <span className="block text-xs text-stone-500">
                        Order #{sale.order_id.slice(0, 8)} · {dateTime(sale.completed_at)}
                        {sale.due_date ? ` · Due ${sale.due_date}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 font-black">{money(sale.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

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
          {report.credit_repayment_total > 0 ? (
            <p className="mt-2 text-xs text-stone-500">
              Customer credit repayments ({money(report.credit_repayment_total)}) are counted in cash and card
              reconciliation, but not again in total receipts: the credit sale was already counted when the order completed.
            </p>
          ) : null}
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
              <p className="mt-2 text-xs text-stone-500">
                Opening {money(report.opening_cash_amount)} + cash orders {money(report.completed_cash_order_total)}
                {report.cash_other_income_total > 0
                  ? ` + cash other income ${money(report.cash_other_income_total)}`
                  : ""}
                {" "}− paid-outs {money(report.cash_paid_out_total)}
              </p>
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

        {view.cashDenominations ? (
          <section className="mt-6">
            <h2 className="text-lg font-black">Cash counted by notes &amp; coins</h2>
            <p className="mt-1 text-xs text-stone-500">
              As counted at close
              {report.correction_reason ? "; a later correction may have changed the counted total" : ""}.
            </p>
            <div className="mt-3 overflow-hidden rounded-lg border border-stone-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                  <tr><th className="px-3 py-2">Note / coin</th><th className="px-3 py-2">Count</th><th className="px-3 py-2 text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {view.cashDenominations.map((row) => (
                    <tr key={row.minor}>
                      <td className="px-3 py-2 font-black">{money(row.minor / 100)}</td>
                      <td className="px-3 py-2">{row.count}</td>
                      <td className="px-3 py-2 text-right font-bold">{money((row.minor * row.count) / 100)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-stone-50">
                  <tr>
                    <td className="px-3 py-2 font-black" colSpan={2}>Total</td>
                    <td className="px-3 py-2 text-right font-black">
                      {money(view.cashDenominations.reduce((sum, row) => sum + row.minor * row.count, 0) / 100)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        ) : null}

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

        {report.paid_outs || report.other_income_entries ? (
          <section className="mt-6 grid gap-4 sm:grid-cols-2">
            {report.paid_outs ? (
              <div>
                <h2 className="text-lg font-black">Cash paid-outs</h2>
                {report.paid_outs.length ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {report.paid_outs.map((paidOut) => (
                      <li className={`rounded-lg p-3 ${paidOut.voided_at ? "bg-stone-100 text-stone-500" : "bg-stone-50"}`} key={paidOut.id}>
                        <div className="flex justify-between gap-3">
                          <span className={`min-w-0 break-words font-bold ${paidOut.voided_at ? "line-through" : ""}`}>{paidOut.reason}</span>
                          <span className={`shrink-0 font-black ${paidOut.voided_at ? "line-through" : ""}`}>{money(paidOut.amount)}</span>
                        </div>
                        <p className="text-xs text-stone-500">
                          {dateTime(paidOut.recorded_at)}
                          {paidOut.voided_at ? ` · Voided${paidOut.void_reason ? `: ${paidOut.void_reason}` : ""}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-3 text-sm text-stone-500">No cash paid-outs.</p>}
              </div>
            ) : null}
            {report.other_income_entries ? (
              <div>
                <h2 className="text-lg font-black">Other income entries</h2>
                {report.other_income_entries.length ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {report.other_income_entries.map((entry) => (
                      <li className={`rounded-lg p-3 ${entry.voided_at ? "bg-stone-100 text-stone-500" : "bg-stone-50"}`} key={entry.id}>
                        <div className="flex justify-between gap-3">
                          <span className={`min-w-0 break-words font-bold ${entry.voided_at ? "line-through" : ""}`}>
                            {otherIncomeCategoryLabels[entry.category as keyof typeof otherIncomeCategoryLabels] ?? entry.category}
                          </span>
                          <span className={`shrink-0 font-black ${entry.voided_at ? "line-through" : ""}`}>{money(entry.amount)}</span>
                        </div>
                        <p className="break-words text-xs text-stone-500">
                          {entry.category === "customer_credit_repayment" && view.canCorrect
                            ? customerLabel(entry.customer_id)
                            : entry.description} · {otherIncomePaymentLabels[entry.payment_method as keyof typeof otherIncomePaymentLabels] ?? entry.payment_method}
                          {entry.reference ? ` · ${entry.reference}` : ""}
                          {entry.voided_at ? ` · Voided${entry.void_reason ? `: ${entry.void_reason}` : ""}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-3 text-sm text-stone-500">No other income.</p>}
              </div>
            ) : null}
          </section>
        ) : null}

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

      {shiftPaidOuts.paidOuts.length > 0 && (!report.paid_outs || canVoidPaidOuts) ? (
        <section className="mt-4 rounded-lg border border-stone-200 bg-white p-4 print:hidden">
          <h2 className="text-lg font-black">{report.paid_outs ? "Paid-outs now" : "Cash paid-outs"}</h2>
          <p className="mt-1 text-xs text-stone-500">
            {canVoidPaidOuts
              ? "Void a paid-out entered by mistake (for example the same bill twice). This saves a new report version."
              : shiftPaidOuts.businessDayClosed
                ? "This shift's business day is closed, so its paid-outs can no longer be changed."
                : "Only restaurant management can void a paid-out after the shift is closed."}
          </p>
          <ul className="mt-3 space-y-2">
            {shiftPaidOuts.paidOuts.map((paidOut) => {
              const voided = Boolean(paidOut.voided_at);
              return (
                <li className={`flex items-start justify-between gap-3 rounded-lg p-3 ${voided ? "bg-stone-100 opacity-70" : "bg-stone-50"}`} key={paidOut.id}>
                  <div className="min-w-0">
                    <p className={`break-words text-sm font-bold ${voided ? "line-through" : ""}`}>{paidOut.reason}</p>
                    <p className="text-xs text-stone-500">{dateTime(paidOut.recorded_at)}</p>
                    {voided ? (
                      <p className="mt-1 text-xs font-bold text-stone-600">
                        Voided {paidOut.voided_at ? dateTime(paidOut.voided_at) : ""}{paidOut.void_reason ? `: ${paidOut.void_reason}` : ""}
                      </p>
                    ) : (
                      <>
                        {paidOutBillStatuses ? <PaidOutBillBadge status={paidOutBillStatuses.get(paidOut.id) ?? "none"} /> : null}
                        {canVoidPaidOuts ? <VoidPaidOutForm closedShift paidOutId={paidOut.id} shiftId={id} /> : null}
                      </>
                    )}
                  </div>
                  <span className={`shrink-0 text-sm font-black ${voided ? "text-stone-500 line-through" : ""}`}>{money(Number(paidOut.amount))}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

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
