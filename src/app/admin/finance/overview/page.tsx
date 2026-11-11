import Link from "next/link";
import { advanceFinancePilotAction } from "@/app/admin/finance/costing/actions";
import { formatFils } from "@/lib/finance";
import { getFinancePilotStatus } from "@/lib/finance-cost-data";
import { requireFinancePermission } from "@/lib/finance-data";
import { getFinanceReportBundle } from "@/lib/finance-report-data";
import { resolveReportRange } from "@/lib/reports";

function changeLabel(current: number | null, prior: number | null) {
  if (current === null || prior === null) return "No comparable estimate";
  if (prior === 0) return current === 0 ? "No change" : "Prior period was zero";
  const change = (current - prior) * 100 / Math.abs(prior);
  return `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs prior period`;
}

export default async function FinanceOverviewPage({
  searchParams
}: {
  searchParams: Promise<{ end?: string; error?: string; preset?: string; start?: string; success?: string }>;
}) {
  const [{ session }, query] = await Promise.all([
    requireFinancePermission("view_reports"), searchParams
  ]);
  const range = resolveReportRange(query.preset, query.start, query.end, new Date(), session.restaurant);
  const [bundle, pilot] = await Promise.all([
    getFinanceReportBundle(session, range),
    session.restaurant.slug === "chaixpress" ? getFinancePilotStatus(session.restaurantId) : Promise.resolve(null)
  ]);
  if (!bundle) return <main className="mx-auto max-w-5xl p-8">Finance reporting is unavailable.</main>;
  const { current, prior } = bundle;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <Link className="text-sm font-bold text-leaf" href="/admin/finance">← Back to Finance</Link>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-sm font-black text-leaf">Smart Finance</p><h1 className="text-3xl font-black text-ink">Estimated operating overview</h1><p className="mt-2 text-sm text-stone-600">{range.label} · based on {current.coveragePct.toFixed(1)}% fully costed product revenue</p></div>
        <form className="grid gap-2 rounded-xl border border-stone-200 bg-white p-3 sm:grid-cols-4" method="get">
          <label className="text-xs font-bold">Period<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" defaultValue={range.preset} name="preset"><option value="today">Today</option><option value="last_7_days">Last 7 days</option><option value="this_month">This month</option><option value="previous_month">Previous month</option><option value="custom">Custom</option></select></label>
          <label className="text-xs font-bold">Start<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" defaultValue={range.startDate} name="start" type="date" /></label>
          <label className="text-xs font-bold">End<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" defaultValue={range.endDate} name="end" type="date" /></label>
          <button className="focus-ring self-end rounded-lg bg-ink px-3 py-2.5 text-sm font-black text-white" type="submit">Apply</button>
        </form>
      </div>

      {query.error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{query.error}</p> : null}
      {query.success ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{query.success}</p> : null}

      {pilot ? <section className="mt-5 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-black uppercase tracking-wide text-leaf">Chai Xpress controlled pilot</p><h2 className="text-xl font-black">Status: {String(pilot.enrollment.status).replaceAll("_", " ")}</h2><p className="mt-1 text-sm text-stone-600">Release remains locked until menu recipes, confirmed prices, recurring costs, ≥80% snapshot coverage, and a manually reconciled sample are present.</p></div><p className="rounded-full bg-stone-100 px-3 py-1 text-sm font-black">{pilot.readiness.coverage_pct}% coverage</p></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4"><p className="rounded-lg bg-stone-50 p-3 text-sm"><strong>{pilot.readiness.base_recipe_count}/{pilot.readiness.menu_item_count}</strong><br />base recipes</p><p className="rounded-lg bg-stone-50 p-3 text-sm"><strong>{pilot.readiness.priced_ingredient_count}</strong><br />priced ingredients</p><p className="rounded-lg bg-stone-50 p-3 text-sm"><strong>{pilot.readiness.recurring_cost_count}</strong><br />recurring costs</p><p className="rounded-lg bg-stone-50 p-3 text-sm"><strong>{pilot.readiness.complete_snapshot_count}/{pilot.readiness.snapshot_count}</strong><br />complete snapshots</p></div>
        <form action={advanceFinancePilotAction} className="mt-4 grid gap-3 rounded-lg border border-stone-200 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-bold">Requested state<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" name="status"><option value="configured">Configured</option><option value="reconciled">Reconciled</option><option value="released">Released</option><option value="paused">Paused</option></select></label>
          <label className="text-xs font-bold">Sample start<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" name="sample_start" type="date" /></label>
          <label className="text-xs font-bold">Sample end<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-2 py-2" name="sample_end" type="date" /></label>
          <label className="flex items-center gap-2 text-xs font-bold lg:self-end lg:pb-3"><input name="confirmed" type="checkbox" value="yes" /> I manually reconciled this sample</label>
          <button className="focus-ring rounded-lg bg-ink px-3 py-2 text-sm font-black text-white lg:self-end" type="submit">Apply gated state</button>
        </form>
      </section> : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-stone-200 bg-white p-4"><p className="text-xs font-bold uppercase text-stone-500">Net sales excluding VAT</p><p className="mt-2 text-2xl font-black">{formatFils(current.netSalesFils)}</p><p className="mt-1 text-xs text-stone-500">{changeLabel(current.netSalesFils, prior.netSalesFils)}</p></article>
        <article className="rounded-xl border border-stone-200 bg-white p-4"><p className="text-xs font-bold uppercase text-stone-500">Estimated consumed cost</p><p className="mt-2 text-2xl font-black">{current.estimatedConsumedCostFils === null ? "Unknown" : formatFils(current.estimatedConsumedCostFils)}</p><p className="mt-1 text-xs text-stone-500">Known snapshots: {formatFils(current.knownDirectCostFils)}</p></article>
        <article className="rounded-xl border border-stone-200 bg-white p-4"><p className="text-xs font-bold uppercase text-stone-500">Accrued operating costs</p><p className="mt-2 text-2xl font-black">{formatFils(current.accruedOperatingCostFils)}</p><p className="mt-1 text-xs text-stone-500">Purchase spend excluded</p></article>
        <article className="rounded-xl border-2 border-leaf/30 bg-mint/30 p-4"><p className="text-xs font-bold uppercase text-leaf">Estimated operating result</p><p className="mt-2 text-2xl font-black">{current.estimatedOperatingResultFils === null ? "Incomplete" : formatFils(current.estimatedOperatingResultFils)}</p><p className="mt-1 text-xs text-stone-600">{changeLabel(current.estimatedOperatingResultFils, prior.estimatedOperatingResultFils)}</p></article>
      </div>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl bg-stone-50 p-4"><p className="text-xs font-bold text-stone-500">Completed orders</p><p className="mt-1 text-xl font-black">{current.orderCount}</p></article>
        <article className="rounded-xl bg-stone-50 p-4"><p className="text-xs font-bold text-stone-500">Output VAT</p><p className="mt-1 text-xl font-black">{formatFils(current.outputVatFils)}</p></article>
        <article className="rounded-xl bg-stone-50 p-4"><p className="text-xs font-bold text-stone-500">Purchase spend</p><p className="mt-1 text-xl font-black">{formatFils(current.purchaseSpendFils)}</p></article>
        <article className="rounded-xl bg-stone-50 p-4"><p className="text-xs font-bold text-stone-500">Cash outflow</p><p className="mt-1 text-xl font-black">{formatFils(current.cashOutflowFils)}</p></article>
        <article className="rounded-xl bg-stone-50 p-4 sm:col-span-2"><p className="text-xs font-bold text-stone-500">Break-even sales</p><p className="mt-1 text-xl font-black">{current.breakEvenSalesFils === null ? "Needs ≥80% coverage and a positive contribution margin" : formatFils(current.breakEvenSalesFils)}</p></article>
        <article className="rounded-xl bg-stone-50 p-4 sm:col-span-2"><p className="text-xs font-bold text-stone-500">Channel fees and promotions</p><p className="mt-1 text-xl font-black">{formatFils(current.channelFeesFils)}</p></article>
      </section>

      {current.warnings.length > 0 ? <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-black text-amber-950">Coverage and reconciliation notes</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">{current.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section> : null}

      <section className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 px-5 py-4"><h2 className="text-lg font-black">Product contribution</h2><p className="mt-1 text-xs text-stone-500">Revenue after allocated order discount and output VAT, less recipe cost and allocated channel fees.</p></div>
        {current.products.length === 0 ? <p className="p-8 text-center text-sm text-stone-500">No completed product sales in this period.</p> : <div className="divide-y divide-stone-100">{current.products.map((product) => <article className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_repeat(4,130px)] sm:items-center" key={product.menuItemId}><div><h3 className="font-black">{product.name}</h3><p className="text-xs text-stone-500">{product.units} sold · {product.completeness}</p></div><div><p className="text-xs text-stone-500">Net revenue</p><p className="font-bold">{formatFils(product.netRevenueFils)}</p></div><div><p className="text-xs text-stone-500">Direct cost</p><p className="font-bold">{product.directCostFils === null ? "Unknown" : formatFils(product.directCostFils)}</p></div><div><p className="text-xs text-stone-500">Contribution</p><p className="font-bold">{product.contributionFils === null ? "Incomplete" : formatFils(product.contributionFils)}</p></div><div><p className="text-xs text-stone-500">Per unit</p><p className="font-bold">{product.contributionPerUnitFils === null ? "—" : formatFils(product.contributionPerUnitFils)}</p></div></article>)}</div>}
      </section>
      <p className="mt-5 text-xs text-stone-500">Management estimate only—not audited profit or a VAT return. Purchase invoices are shown separately and are not double-counted against recipe-based consumed cost.</p>
    </main>
  );
}
