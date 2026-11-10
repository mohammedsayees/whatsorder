import Link from "next/link";
import {
  createFinanceRecurringCostAction,
  toggleFinanceRecurringCostAction
} from "@/app/admin/finance/actions";
import { FINANCE_FREQUENCIES, formatFils, monthlyAllocationSchedule } from "@/lib/finance";
import {
  getFinanceCategories,
  getFinanceRecurringCosts,
  requireFinancePermission
} from "@/lib/finance-data";

export default async function FinanceRecurringPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const [{ session }, query] = await Promise.all([requireFinancePermission("manage_recurring"), searchParams]);
  const [categories, costs] = await Promise.all([
    getFinanceCategories(session.restaurantId),
    getFinanceRecurringCosts(session.restaurantId)
  ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: session.restaurant.time_zone ?? "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
      <Link className="text-sm font-bold text-leaf" href="/admin/finance">← Back to expenses</Link>
      <h1 className="mt-3 text-3xl font-black text-ink">Recurring costs</h1>
      <p className="mt-2 max-w-3xl text-sm text-stone-600">Schedules represent expected accruals. They do not create paid expense rows or duplicate cash outflows.</p>
      {query.error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{query.error}</p> : null}
      {query.success ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{query.success}</p> : null}

      <section className="mt-6 grid gap-3 md:grid-cols-2">
        {costs.length === 0 ? <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500 md:col-span-2">No recurring costs configured.</p> : costs.map((cost) => {
          const monthly = monthlyAllocationSchedule(Number(cost.amount_fils), cost.allocation_months)[0];
          return <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm" key={cost.id}><div className="flex items-start justify-between gap-3"><div><h2 className="font-black">{cost.description}</h2><p className="mt-1 text-sm text-stone-500">{cost.finance_categories?.name} · {cost.frequency}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${cost.is_active ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-500"}`}>{cost.is_active ? "active" : "paused"}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-stone-500">Scheduled amount</dt><dd className="font-black">{formatFils(Number(cost.amount_fils))}</dd></div><div><dt className="text-stone-500">Monthly allocation</dt><dd className="font-black">{formatFils(monthly)}</dd></div><div><dt className="text-stone-500">Next due</dt><dd className="font-bold">{cost.next_due_on}</dd></div><div><dt className="text-stone-500">Allocation period</dt><dd className="font-bold">{cost.allocation_months} month{cost.allocation_months === 1 ? "" : "s"}</dd></div></dl><form action={toggleFinanceRecurringCostAction} className="mt-4 border-t border-stone-100 pt-3"><input name="recurring_id" type="hidden" value={cost.id} /><button className="focus-ring rounded-lg border border-stone-300 px-3 py-2 text-xs font-black" name="is_active" value={cost.is_active ? "false" : "true"}>{cost.is_active ? "Pause" : "Resume"}</button></form></article>;
        })}
      </section>

      <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black">Add recurring cost</h2>
        <form action={createFinanceRecurringCostAction} className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold sm:col-span-2">Description<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" maxLength={240} name="description" required /></label>
          <label className="text-sm font-bold">Category<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="category_id" required><option value="">Choose category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="text-sm font-bold">Amount (AED)<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" inputMode="decimal" name="amount" required /></label>
          <label className="text-sm font-bold">Frequency<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5 capitalize" name="frequency">{FINANCE_FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{frequency}</option>)}</select></label>
          <label className="text-sm font-bold">Allocate over months<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue="1" max="120" min="1" name="allocation_months" required type="number" /><span className="mt-1 block text-xs font-normal text-stone-500">Use 12 for an annual licence allocated monthly.</span></label>
          <label className="text-sm font-bold">Starts on<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue={today} name="start_on" required type="date" /></label>
          <label className="text-sm font-bold">Next due on<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue={today} name="next_due_on" required type="date" /></label>
          <label className="text-sm font-bold">Ends on (optional)<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="end_on" type="date" /></label>
          <button className="focus-ring self-end rounded-lg bg-leaf px-4 py-3 text-sm font-black text-white" type="submit">Add recurring cost</button>
        </form>
      </section>
    </main>
  );
}
