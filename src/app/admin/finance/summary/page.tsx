import Link from "next/link";
import { formatFils } from "@/lib/finance";
import { requireFinancePermission } from "@/lib/finance-data";
import { getFinanceReportBundle } from "@/lib/finance-report-data";
import { buildSimpleSummary } from "@/lib/finance-simple";
import { resolveReportRange } from "@/lib/reports";

export const dynamic = "force-dynamic";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "this_month", label: "This month" },
  { value: "previous_month", label: "Last month" }
] as const;

export default async function FinanceSummaryPage({
  searchParams
}: {
  searchParams: Promise<{ preset?: string }>;
}) {
  const [{ session }, query] = await Promise.all([requireFinancePermission("view_reports"), searchParams]);
  const preset = PERIODS.some((period) => period.value === query.preset) ? query.preset! : "this_month";
  const range = resolveReportRange(preset, undefined, undefined, new Date(), session.restaurant);
  const bundle = await getFinanceReportBundle(session, range).catch(() => null);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link className="text-sm font-bold text-leaf" href="/admin/finance">← Back</Link>
      <h1 className="mt-3 text-3xl font-black text-ink">How am I doing?</h1>
      <nav aria-label="Period" className="mt-4 flex flex-wrap gap-2">
        {PERIODS.map((period) => (
          <Link
            className={`focus-ring rounded-full px-4 py-2 text-sm font-black ${period.value === preset ? "bg-ink text-white" : "border border-stone-300 bg-white text-stone-700"}`}
            href={`/admin/finance/summary?preset=${period.value}`}
            key={period.value}
          >
            {period.label}
          </Link>
        ))}
      </nav>

      {!bundle ? (
        <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-900">The numbers couldn’t be loaded right now. Try again in a minute.</p>
      ) : (() => {
        const summary = buildSimpleSummary(bundle.current, bundle.prior, formatFils);
        const trendText = summary.trend === "up" ? "🟢 Better than the period before"
          : summary.trend === "down" ? "🔴 Lower than the period before"
          : summary.trend === "same" ? "Same as the period before" : "";
        return (
          <>
            <section className="mt-5 overflow-hidden rounded-2xl border border-stone-200 bg-white">
              <dl className="divide-y divide-stone-100">
                <div className="flex items-center justify-between px-5 py-4"><dt className="text-base font-bold text-stone-600">Sales <span className="text-xs font-normal">(without VAT)</span></dt><dd className="text-2xl font-black">{formatFils(summary.salesFils)}</dd></div>
                <div className="flex items-center justify-between px-5 py-4"><dt className="text-base font-bold text-stone-600">Costs</dt><dd className="text-2xl font-black">{formatFils(summary.costsFils)}</dd></div>
                <div className="flex items-center justify-between bg-mint/40 px-5 py-4">
                  <dt className="text-base font-black text-ink">Profit <span className="text-xs font-normal">(estimate)</span></dt>
                  <dd className={`text-3xl font-black ${summary.profitFils !== null && summary.profitFils < 0 ? "text-red-700" : "text-ink"}`}>
                    {summary.profitFils === null ? "—" : formatFils(summary.profitFils)}
                  </dd>
                </div>
              </dl>
              {trendText ? <p className="border-t border-stone-100 px-5 py-3 text-sm font-bold">{trendText}</p> : null}
            </section>
            {summary.profitFils === null ? (
              <p className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">To see profit, add what your menu items cost you to make. Ask the owner to set this up.</p>
            ) : null}
            <section className="mt-5">
              <h2 className="text-lg font-black text-ink">In short</h2>
              <ul className="mt-2 space-y-2">
                {summary.sentences.map((sentence) => (
                  <li className="rounded-xl bg-stone-50 px-4 py-3 text-sm" key={sentence}>{sentence}</li>
                ))}
              </ul>
            </section>
            <p className="mt-6 text-xs text-stone-500">Costs include food costs, delivery app fees, rent, salaries and other monthly bills. Stock you bought but haven’t used yet isn’t counted. This is an estimate, not an official account.</p>
          </>
        );
      })()}
    </main>
  );
}
