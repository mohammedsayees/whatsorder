import Link from "next/link";
import { saveQuickItemCostsAction } from "@/app/admin/finance/setup/actions";
import { formatFils } from "@/lib/finance";
import { getQuickItemCosts } from "@/lib/finance-cost-data";
import { requireFinancePermission } from "@/lib/finance-data";
import { filsToInput } from "@/lib/finance-simple";

export const dynamic = "force-dynamic";
// Saving re-costs recent orders, which can take a few seconds.
export const maxDuration = 60;

export default async function FinanceMenuCostsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const [{ session }, query] = await Promise.all([requireFinancePermission("manage_costing"), searchParams]);
  const items = await getQuickItemCosts(session.restaurantId).catch(() => []);
  const missing = items.filter((item) => item.isAvailable && item.quickCostFils === null && !item.hasFullRecipe).length;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link className="text-sm font-bold text-leaf" href="/admin/finance">← Back</Link>
      <h1 className="mt-3 text-3xl font-black text-ink">Menu costs</h1>
      <p className="mt-1 text-sm text-stone-600">
        For each item: about how much does it cost you to make one? Include cups, lids and add-ons. A rough number is fine.
      </p>
      {query.error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{query.error}</p> : null}
      {query.success ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">✓ {query.success}</p> : null}
      {missing > 0 ? <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{missing} item{missing === 1 ? "" : "s"} still need a cost.</p> : null}

      {items.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-sm text-stone-500">No menu items yet.</p>
      ) : (
        <form action={saveQuickItemCostsAction} className="mt-5">
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            {items.map((item) => {
              const pct = item.quickCostFils !== null && item.priceFils > 0
                ? Math.round(item.quickCostFils * 100 / item.priceFils) : null;
              return (
                <li className={`grid grid-cols-[1fr_120px] items-center gap-3 px-4 py-3 ${item.isAvailable ? "" : "opacity-60"}`} key={item.menuItemId}>
                  <div className="min-w-0">
                    <p className="truncate font-black text-ink">{item.name}</p>
                    <p className="text-xs text-stone-500">
                      Sells for {formatFils(item.priceFils)}
                      {pct !== null ? ` · cost is ${pct}% of the price` : ""}
                      {item.isAvailable ? "" : " · not on the menu now"}
                    </p>
                  </div>
                  {item.hasFullRecipe ? (
                    <p className="text-right text-xs font-bold text-stone-500">Uses a full recipe</p>
                  ) : (
                    <label className="text-xs font-bold text-stone-500">
                      <span className="sr-only">Cost to make one {item.name}</span>
                      <span aria-hidden>AED</span>
                      <input name={`name_${item.menuItemId}`} type="hidden" value={item.name} />
                      <input name={`previous_${item.menuItemId}`} type="hidden" value={filsToInput(item.quickCostFils)} />
                      <input
                        className="focus-ring mt-0.5 block w-full rounded-lg border border-stone-300 px-3 py-2.5 text-right text-base font-black text-ink"
                        defaultValue={filsToInput(item.quickCostFils)}
                        inputMode="decimal"
                        name={`cost_${item.menuItemId}`}
                        placeholder="0.00"
                      />
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
          <button className="focus-ring sticky bottom-4 mt-5 w-full rounded-xl bg-leaf px-4 py-4 text-base font-black text-white shadow-lg" type="submit">Save menu costs</button>
          <p className="mt-2 text-center text-xs text-stone-500">New costs also count for orders since the start of last month.</p>
        </form>
      )}
    </main>
  );
}
