import Link from "next/link";
import {
  confirmFinancePurchasePriceAction,
  createFinanceIngredientAction
} from "@/app/admin/finance/costing/actions";
import { formatFils } from "@/lib/finance";
import { getFinanceCostingWorkspace } from "@/lib/finance-cost-data";
import { requireFinancePermission } from "@/lib/finance-data";

export default async function FinanceIngredientsPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const [{ session }, query] = await Promise.all([
    requireFinancePermission("manage_costing"), searchParams
  ]);
  const workspace = await getFinanceCostingWorkspace(session.restaurantId);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <Link className="text-sm font-bold text-leaf" href="/admin/finance">← Back to Finance</Link>
      <h1 className="mt-3 text-3xl font-black text-ink">Ingredients and purchase costs</h1>
      <p className="mt-2 max-w-3xl text-sm text-stone-600">Only confirmed prices affect recipe estimates. Purchase invoices remain purchase spend and are never also deducted as consumed COGS.</p>
      {query.error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{query.error}</p> : null}
      {query.success ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{query.success}</p> : null}

      <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black">Create canonical ingredient</h2>
        <form action={createFinanceIngredientAction} className="mt-4 grid gap-3 md:grid-cols-[1fr_160px_140px_130px_auto]">
          <label className="text-sm font-bold">Name<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" maxLength={120} name="name" required /></label>
          <label className="text-sm font-bold">Kind<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="kind"><option value="ingredient">Ingredient</option><option value="packaging">Packaging</option></select></label>
          <label className="text-sm font-bold">Canonical unit<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="canonical_unit"><option value="g">Gram (g)</option><option value="ml">Millilitre (ml)</option><option value="each">Each</option></select></label>
          <label className="text-sm font-bold">Usable yield %<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue="100" inputMode="decimal" name="yield_pct" required /></label>
          <button className="focus-ring self-end rounded-lg bg-ink px-4 py-3 text-sm font-black text-white" type="submit">Create</button>
        </form>
      </section>

      <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black">Confirm purchase price</h2>
        <p className="mt-1 text-xs text-stone-500">Example: 2 packs × 1 kg for AED 36 at 90% yield becomes 2 fils per usable gram.</p>
        <form action={confirmFinancePurchasePriceAction} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-bold">Ingredient<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="ingredient_id" required><option value="">Choose</option>{workspace.ingredients.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.canonical_unit})</option>)}</select></label>
          <label className="text-sm font-bold">Approved invoice line<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="source_line_id"><option value="">Manual confirmation</option>{workspace.purchaseLines.filter((line) => !line.ingredient_id).map((line) => <option key={line.id} value={line.id}>{line.description} · {formatFils(Number(line.amount_fils))}</option>)}</select></label>
          <label className="text-sm font-bold">Supplier<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" maxLength={160} name="supplier_name" /></label>
          <label className="text-sm font-bold">Effective date<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="effective_on" required type="date" /></label>
          <label className="text-sm font-bold">Pack count<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue="1" inputMode="decimal" name="pack_count" required /></label>
          <label className="text-sm font-bold">Size per pack<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" inputMode="decimal" name="pack_size" required /></label>
          <label className="text-sm font-bold">Pack unit<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" name="pack_unit"><option value="kg">kg</option><option value="g">g</option><option value="l">L</option><option value="ml">ml</option><option value="each">each</option></select></label>
          <label className="text-sm font-bold">Total cost (AED)<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" inputMode="decimal" name="total_cost" required /></label>
          <button className="focus-ring rounded-lg bg-leaf px-4 py-3 text-sm font-black text-white lg:col-span-4" type="submit">Confirm price</button>
        </form>
      </section>

      <section className="mt-6 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 px-5 py-4"><h2 className="text-lg font-black">Current cost basis</h2></div>
        {workspace.ingredients.length === 0 ? <p className="p-8 text-center text-sm text-stone-500">No ingredients configured.</p> : <div className="divide-y divide-stone-100">{workspace.ingredients.map((ingredient) => { const price = workspace.prices.find((item) => item.ingredient_id === ingredient.id); return <article className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_auto]" key={ingredient.id}><div><h3 className="font-black">{ingredient.name}</h3><p className="text-xs text-stone-500">{ingredient.kind} · {ingredient.canonical_unit} · {Number(ingredient.yield_pct)}% usable yield</p></div><p className="text-sm font-bold">{price ? `${Number(price.normalized_unit_cost_fils).toFixed(4)} fils/${ingredient.canonical_unit}` : "Missing confirmed price"}</p></article>; })}</div>}
      </section>
    </main>
  );
}
