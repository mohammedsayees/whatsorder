import Link from "next/link";
import { updateFinanceCostSettingsAction } from "@/app/admin/finance/costing/actions";
import { FinanceRecipeForm } from "@/components/admin/FinanceRecipeForm";
import { getFinanceRecipeWorkspace, getFinanceSettings } from "@/lib/finance-cost-data";
import { requireFinancePermission } from "@/lib/finance-data";

export default async function FinanceRecipesPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; item?: string; success?: string }>;
}) {
  const [{ session }, query] = await Promise.all([
    requireFinancePermission("manage_costing"), searchParams
  ]);
  const [workspace, settings] = await Promise.all([
    getFinanceRecipeWorkspace(session.restaurantId), getFinanceSettings(session.restaurantId)
  ]);
  const selectedItem = workspace.items.find((item) => item.id === query.item) ?? workspace.items[0];
  const groupIds = new Set(workspace.links.filter((link) => link.menu_item_id === selectedItem?.id).map((link) => link.group_id));
  const options = workspace.options.filter((option) => groupIds.has(option.group_id));
  const activeTargets = new Set(workspace.recipes.filter((recipe) => recipe.status === "active").map((recipe) => `${recipe.menu_item_id}:${recipe.menu_option_id ?? "base"}`));

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <Link className="text-sm font-bold text-leaf" href="/admin/finance">← Back to Finance</Link>
      <h1 className="mt-3 text-3xl font-black text-ink">Recipe costing</h1>
      <p className="mt-2 max-w-3xl text-sm text-stone-600">Recipes are effective-dated. New revisions affect future snapshots only; completed order snapshots remain traceable.</p>
      {query.error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">{query.error}</p> : null}
      {query.success ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{query.success}</p> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm"><h2 className="px-2 py-2 font-black">Menu coverage</h2><div className="max-h-[70vh] space-y-1 overflow-auto">{workspace.items.map((item) => <Link className={`block rounded-lg px-3 py-2 text-sm ${item.id === selectedItem?.id ? "bg-mint font-black text-leaf" : "hover:bg-stone-50"}`} href={`/admin/finance/recipes?item=${item.id}`} key={item.id}><span className="block">{item.name}</span><span className="text-xs text-stone-500">{activeTargets.has(`${item.id}:base`) ? "Base recipe configured" : "Missing base recipe"}</span></Link>)}</div></aside>
        <div className="space-y-6">
          {selectedItem ? <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-black">{selectedItem.name}</h2><p className="mt-1 text-xs text-stone-500">Configure the base item and each selectable option. Unconfigured selected options remain incomplete.</p><div className="mt-5"><FinanceRecipeForm ingredients={workspace.ingredients} itemId={selectedItem.id} options={options} /></div></section> : <section className="rounded-xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">No menu items exist.</section>}
          <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Costing policy</h2><form action={updateFinanceCostSettingsAction} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Cost basis<select className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue={String(settings?.cost_basis ?? "latest")} name="cost_basis"><option value="latest">Latest confirmed purchase</option><option value="weighted_average">Weighted average confirmed purchases</option></select></label><label className="text-sm font-bold">Output VAT rate %<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue={Number(settings?.output_vat_rate_bps ?? 500) / 100} inputMode="decimal" name="output_vat_rate" required /></label><label className="text-sm font-bold">Direct channel fee %<input className="focus-ring mt-1 block w-full rounded-lg border border-stone-200 px-3 py-2.5" defaultValue={Number(settings?.direct_fee_bps ?? 0) / 100} inputMode="decimal" name="direct_fee_rate" required /></label><label className="flex items-center gap-2 self-end pb-3 text-sm font-bold"><input defaultChecked={settings?.prices_include_vat !== false} name="prices_include_vat" type="checkbox" /> Customer prices include VAT</label><button className="focus-ring rounded-lg bg-ink px-4 py-3 text-sm font-black text-white sm:col-span-2" type="submit">Save costing policy</button></form></section>
        </div>
      </div>
    </main>
  );
}
