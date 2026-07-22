import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { BusinessDayReportActions } from "@/components/admin/BusinessDayReportActions";
import { otherIncomeCategoryLabels } from "@/lib/business-day";
import { getBusinessDayReportView } from "@/lib/business-day-data";
import { formatCurrency } from "@/lib/currency";
import { formatRestaurantShortDateTime } from "@/lib/date-time";
import { requireRestaurantRole } from "@/lib/super-admin-auth";
import type { BusinessDayCloseReportSnapshot, BusinessDayShiftSnapshot } from "@/lib/types";

function Metric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-emerald-50" : "bg-stone-50"}`}>
      <dt className="text-xs font-bold uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-1 text-lg font-black">{value}</dd>
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
  const dateTime = (value: string) => formatRestaurantShortDateTime(value, report);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 print:max-w-none print:px-0 print:py-0">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <Link className="focus-ring inline-flex items-center gap-2 text-sm font-black text-leaf" href="/admin/shifts">
          <ArrowLeft size={16} /> Back to shifts
        </Link>
        <BusinessDayReportActions />
      </div>

      <article className="mt-5 rounded-lg border border-stone-200 bg-white p-5 shadow-sm print:mt-0 print:border-0 print:p-0 print:shadow-none">
        <header className="border-b border-stone-200 pb-4">
          <p className="text-sm font-bold uppercase tracking-wide text-leaf">Business day close report</p>
          <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-black">{report.restaurant_name}</h1>
              <p className="mt-1 text-lg font-bold text-stone-600">Business day {report.business_date}</p>
            </div>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black uppercase tracking-wide">Final</span>
          </div>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="text-stone-500">Operating period opened</dt><dd className="font-bold">{dateTime(report.opened_at)}</dd></div>
            <div><dt className="text-stone-500">Operating period closed</dt><dd className="font-bold">{dateTime(report.closed_at)}</dd></div>
            <div><dt className="text-stone-500">Shifts</dt><dd className="font-bold">{report.shift_count}</dd></div>
          </dl>
        </header>

        <section className="mt-5">
          <h2 className="text-lg font-black">Operational receipts</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="WhatsOrder sales" value={money(report.whatsorder_sales)} />
            <Metric label="Marketplace sales" value={money(report.marketplace_sales)} />
            <Metric label="Other income" value={money(report.other_income_total)} />
            <Metric highlight label="Total receipts" value={money(report.total_operational_receipts)} />
          </dl>
          <p className="mt-2 text-xs text-stone-500">Other income remains separate from order sales, order count and average order value.</p>
        </section>

        <section className="mt-6 grid gap-5 md:grid-cols-2">
          <div>
            <h2 className="text-lg font-black">Payment and cash movement</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <Metric label="Cash order sales" value={money(report.cash_order_sales)} />
              <Metric label="Cash other income" value={money(report.cash_other_income_total)} />
              <Metric label="Cash paid-outs" value={money(report.cash_paid_out_total)} />
              <Metric label="Net cash movement" value={money(report.net_cash_movement)} />
              <Metric label="Card order sales" value={money(report.card_order_sales)} />
              {report.country_code === "IN" ? <Metric label="UPI order sales" value={money(report.upi_order_sales)} /> : null}
            </dl>
          </div>
          <div>
            <h2 className="text-lg font-black">Reconciliation</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <Metric label="Cash difference" value={money(report.cash_difference_total)} />
              <Metric label="Card difference" value={money(report.card_difference_total)} />
              {report.country_code === "IN" ? <Metric label="UPI difference" value={money(report.upi_difference_total)} /> : null}
              <Metric label="Final shift cash counted" value={money(report.final_cash_counted)} />
            </dl>
            <p className="mt-2 text-xs text-stone-500">Opening and closing floats are shown per shift below and are not added together.</p>
          </div>
        </section>

        {Object.keys(report.other_income_breakdown).length ? (
          <section className="mt-6">
            <h2 className="text-lg font-black">Other income breakdown</h2>
            <div className="mt-3 rounded-lg bg-stone-50 p-3 text-sm">
              {Object.entries(report.other_income_breakdown).map(([category, amount]) => (
                <p className="flex justify-between gap-3 py-1" key={category}>
                  <span>{otherIncomeCategoryLabels[category as keyof typeof otherIncomeCategoryLabels] ?? category}</span>
                  <span className="font-bold">{money(Number(amount))}</span>
                </p>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-6">
          <h2 className="text-lg font-black">Included shifts</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-stone-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr><th className="px-3 py-2">Shift</th><th className="px-3 py-2">Sales</th><th className="px-3 py-2">Other income</th><th className="px-3 py-2">Expected cash</th><th className="px-3 py-2">Counted</th><th className="px-3 py-2">Difference</th></tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {report.shifts.map((shift: BusinessDayShiftSnapshot) => (
                  <tr key={shift.id}>
                    <td className="px-3 py-2"><p className="font-black">{shift.name}</p><p className="whitespace-nowrap text-xs text-stone-500">{dateTime(shift.opened_at)} → {dateTime(shift.closed_at)}</p></td>
                    <td className="px-3 py-2 font-bold">{money(shift.sales)}</td>
                    <td className="px-3 py-2">{money(shift.other_income)}</td>
                    <td className="px-3 py-2">{money(shift.expected_cash)}</td>
                    <td className="px-3 py-2">{money(shift.cash_counted)}</td>
                    <td className={`px-3 py-2 font-black ${shift.cash_difference === 0 ? "text-emerald-700" : "text-amber-700"}`}>{money(shift.cash_difference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="mt-6 border-t border-stone-200 pt-3 text-xs text-stone-500">
          Immutable report generated {dateTime(report.report_generated_at)} · Business day ID {report.business_day_id}
        </footer>
      </article>
    </main>
  );
}
