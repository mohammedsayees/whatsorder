import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BusinessDayReportActions } from "@/components/admin/BusinessDayReportActions";
import { otherIncomeCategoryLabels, otherIncomePaymentLabels } from "@/lib/business-day";
import { breakdownWithoutUnbilled, cashSalesSplit, unbilledFromReport } from "@/lib/unbilled-sales";
import { getBusinessDayReportView, getUnbilledSalesForShifts } from "@/lib/business-day-data";
import { formatCurrency } from "@/lib/currency";
import { formatRestaurantShortDateTime } from "@/lib/date-time";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import type { BusinessDayCloseReportSnapshot, BusinessDayShiftSnapshot } from "@/lib/types";

function Metric({
  label, value, highlight = false, detail
}: { label: string; value: string; highlight?: boolean; detail?: string }) {
  return (
    <div className={`break-inside-avoid rounded-lg p-3 print:p-1.5 ${highlight ? "bg-emerald-50" : "bg-stone-50"}`}>
      <dt className="text-xs font-bold uppercase tracking-wide text-stone-500 print:text-[9px]">{label}</dt>
      <dd className="mt-1 text-lg font-black print:mt-0 print:text-sm">{value}</dd>
      {detail ? <dd className="mt-0.5 text-xs text-stone-500 print:text-[9px]">{detail}</dd> : null}
    </div>
  );
}

export default async function BusinessDayReportPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const [session, { id }] = await Promise.all([
    requireRestaurantRole(["restaurant_admin", "owner", "manager"]),
    params
  ]);
  const view = await getBusinessDayReportView(session, id);
  if (!view) notFound();
  const report = view.reports[0].snapshot as BusinessDayCloseReportSnapshot;
  const money = (value: number) => formatCurrency(value, report);
  // Unbilled sales are stored as receipts but reported as sales.
  const unbilledTotal = unbilledFromReport(report).total;
  const cashSales = cashSalesSplit(
    report.cash_order_sales,
    unbilledTotal > 0
      ? await getUnbilledSalesForShifts(session, report.shifts.map((shift) => shift.id))
      : { total: 0, byMethod: {} }
  );
  const cashOtherIncome = Math.round((report.cash_other_income_total - cashSales.unbilled) * 100) / 100;
  const otherIncomeBreakdown = breakdownWithoutUnbilled(report.other_income_breakdown);
  const orderCount = report.completed_order_count;
  const avgOrderValue = orderCount > 0 ? Math.round((report.whatsorder_sales / orderCount) * 100) / 100 : 0;
  const pct = (part: number) =>
    report.total_operational_receipts > 0 ? `${Math.round((part / report.total_operational_receipts) * 1000) / 10}%` : "0%";
  const creditSold = report.credit?.sold_total ?? 0;
  const dateTime = (value: string) => formatRestaurantShortDateTime(value, report);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 print:max-w-none print:px-0 print:py-0 print:text-[11px] print:leading-tight">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Link className="focus-ring inline-flex items-center gap-2 text-sm font-black text-leaf" href="/admin/shifts">
          <ArrowLeft size={16} /> Back to shifts
        </Link>
        <BusinessDayReportActions />
      </div>

      <article className="mt-5 rounded-lg border border-stone-200 bg-white p-5 shadow-sm print:mt-0 print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-stone-200 pb-4 print:pb-1">
          <p className="text-sm font-bold uppercase tracking-wide text-leaf">Business day close report</p>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black print:text-lg">{report.restaurant_name}</h1>
              <p className="mt-1 text-lg font-bold text-stone-600 print:mt-0 print:text-xs">Business day {report.business_date}</p>
            </div>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black uppercase tracking-wide">Final</span>
          </div>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3 print:mt-1 print:grid-cols-3 print:text-[10px]">
            <div><dt className="text-stone-500">Operating period opened</dt><dd className="font-bold">{dateTime(report.opened_at)}</dd></div>
            <div><dt className="text-stone-500">Operating period closed</dt><dd className="font-bold">{dateTime(report.closed_at)}</dd></div>
            <div><dt className="text-stone-500">Shifts</dt><dd className="font-bold">{report.shift_count}</dd></div>
          </dl>
        </header>

        <section className="mt-5 print:mt-2">
          <h2 className="text-lg font-black print:text-sm">Operational receipts</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:mt-1 print:grid-cols-4 print:gap-1">
            <Metric label="WhatsOrder sales" value={money(report.whatsorder_sales)} />
            {unbilledTotal > 0 ? <Metric label="Unbilled sales (no order)" value={money(unbilledTotal)} /> : null}
            <Metric label="Marketplace sales" value={money(report.marketplace_sales)} />
            <Metric label="Other income" value={money(report.other_income_total - unbilledTotal)} />
            <Metric highlight label="Total receipts" value={money(report.total_operational_receipts)} />
            <Metric label="Completed orders" value={String(orderCount)} detail={report.cancelled_order_count > 0 ? `${report.cancelled_order_count} cancelled` : undefined} />
            <Metric label="Average order value" value={orderCount > 0 ? money(avgOrderValue) : "–"} detail="WhatsOrder sales ÷ completed orders" />
          </dl>
          <p className="mt-2 text-xs text-stone-500 print:mt-1 print:text-[9px]">
            Payment mix of total receipts: cash {pct(cashSales.total + cashOtherIncome)} · card {pct(report.card_order_sales + report.card_other_income_total)}
            {creditSold > 0 ? ` · on credit ${pct(creditSold)}` : ""}
            {report.country_code === "IN" ? ` · UPI ${pct(report.upi_order_sales + report.upi_other_income_total)}` : ""}.
            Receipts are sales taken, not profit: purchases, rent and wages are not included.
          </p>
          <p className="mt-2 text-xs text-stone-500">Other income remains separate from order sales, order count and average order value.</p>
          {report.credit_repayment_total > 0 ? (
            <p className="mt-1 text-xs text-stone-500">
              Total receipts exclude customer credit repayments ({money(report.credit_repayment_total)}): those sales were
              already counted when the credit orders completed.
            </p>
          ) : null}
        </section>

        {report.credit ? (
          <section className="mt-6 print:mt-2">
            <h2 className="text-lg font-black print:text-sm">Customer credit</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:mt-1 print:grid-cols-4 print:gap-1">
              <Metric
                label={`Sold on credit (${report.credit.sold_order_count})`}
                value={money(report.credit.sold_total)}
              />
              <Metric label="Credit collected" value={money(report.credit.collected_total)} />
              <Metric label="Owed by all customers at close" value={money(report.credit.outstanding_at_close)} />
              <Metric label="Overdue at close" value={money(report.credit.overdue_at_close)} />
            </dl>
            {Object.keys(report.credit.collected_by_method).length ? (
              <p className="mt-2 text-xs text-stone-500">
                Collected by{" "}
                {Object.entries(report.credit.collected_by_method)
                  .map(([method, amount]) => `${otherIncomePaymentLabels[method as keyof typeof otherIncomePaymentLabels] ?? method} ${money(Number(amount))}`)
                  .join(" · ")}
                . Owed and overdue are totals across all credit customers when the day closed.
              </p>
            ) : (
              <p className="mt-2 text-xs text-stone-500">
                Owed and overdue are totals across all credit customers when the day closed.
              </p>
            )}
          </section>
        ) : null}

        <section className="mt-6 grid gap-5 md:grid-cols-2 print:mt-2 print:grid-cols-2 print:gap-2">
          <div>
            <h2 className="text-lg font-black print:text-sm">Payment and cash movement</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 print:mt-1 print:gap-1">
              <Metric
                detail={cashSales.unbilled > 0
                  ? `Billed (orders) ${money(cashSales.billed)} · Unbilled ${money(cashSales.unbilled)}`
                  : undefined}
                label="Total cash sales"
                value={money(cashSales.total)}
              />
              <Metric label="Cash other income" value={money(cashOtherIncome)} />
              <Metric label="Cash paid-outs" value={money(report.cash_paid_out_total)} />
              <Metric label="Net cash movement" value={money(report.net_cash_movement)} />
              <Metric label="Card order sales" value={money(report.card_order_sales)} />
              {report.country_code === "IN" ? <Metric label="UPI order sales" value={money(report.upi_order_sales)} /> : null}
              {report.credit ? <Metric label="Customer credit sales" value={money(report.credit.sold_total)} /> : null}
            </dl>
          </div>
          <div>
            <h2 className="text-lg font-black print:text-sm">Reconciliation</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 print:mt-1 print:gap-1">
              <Metric label="Cash difference" value={money(report.cash_difference_total)} />
              <Metric label="Card difference" value={money(report.card_difference_total)} />
              {report.country_code === "IN" ? <Metric label="UPI difference" value={money(report.upi_difference_total)} /> : null}
              <Metric label="Final shift cash counted" value={money(report.final_cash_counted)} />
            </dl>
            <p className="mt-2 text-xs text-stone-500">Opening and closing floats are shown per shift below and are not added together.</p>
          </div>
        </section>

        {Object.keys(otherIncomeBreakdown).length ? (
          <section className="mt-6 print:mt-2">
            <h2 className="text-lg font-black print:text-sm">Other income breakdown</h2>
            <div className="mt-3 rounded-lg bg-stone-50 p-3 text-sm">
              {Object.entries(otherIncomeBreakdown).map(([category, amount]) => (
                <p className="flex justify-between gap-3 py-1" key={category}>
                  <span>{otherIncomeCategoryLabels[category as keyof typeof otherIncomeCategoryLabels] ?? category}</span>
                  <span className="font-bold">{money(Number(amount))}</span>
                </p>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-6 print:mt-2">
          <h2 className="text-lg font-black print:text-sm">Included shifts</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-stone-200 print:mt-1 print:overflow-visible">
            <table className="min-w-full text-left text-sm print:text-[10px]">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr><th className="px-3 py-2 print:px-1 print:py-0.5">Shift</th><th className="px-3 py-2 print:px-1 print:py-0.5">Sales</th><th className="px-3 py-2 print:px-1 print:py-0.5">Other income</th><th className="px-3 py-2 print:px-1 print:py-0.5">Expected cash</th><th className="px-3 py-2 print:px-1 print:py-0.5">Counted</th><th className="px-3 py-2 print:px-1 print:py-0.5">Difference</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {report.shifts.map((shift: BusinessDayShiftSnapshot) => (
                  <tr key={shift.id}>
                    <td className="px-3 py-2 print:px-1 print:py-0.5"><p className="font-black">{shift.name}</p><p className="whitespace-nowrap text-xs text-stone-500">{dateTime(shift.opened_at)} → {dateTime(shift.closed_at)}</p></td>
                    <td className="px-3 py-2 print:px-1 print:py-0.5 font-bold">{money(shift.sales)}</td>
                    <td className="px-3 py-2 print:px-1 print:py-0.5">{money(shift.other_income)}</td>
                    <td className="px-3 py-2 print:px-1 print:py-0.5">{money(shift.expected_cash)}</td>
                    <td className="px-3 py-2 print:px-1 print:py-0.5">{money(shift.cash_counted)}</td>
                    <td className={`px-3 py-2 print:px-1 print:py-0.5 font-black ${shift.cash_difference === 0 ? "text-emerald-700" : "text-amber-700"}`}>{money(shift.cash_difference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="mt-6 break-all print:mt-2 border-t border-stone-200 pt-3 text-xs text-stone-500">
          Immutable report generated {dateTime(report.report_generated_at)} · Business day ID {report.business_day_id}
        </footer>
      </article>
    </main>
  );
}
