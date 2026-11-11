import Link from "next/link";
import { updateFinancePermissionsAction } from "@/app/admin/finance/actions";
import { getFinanceRolePermissions, requireFinancePermission } from "@/lib/finance-data";

const permissionFields = [
  ["can_view", "View finance", "Read categories, recurring costs, expenses and audit history."],
  ["can_create", "Add manual expenses", "Create entries; users without approval access create drafts."],
  ["can_approve", "Approve or void", "Finalize drafts and void incorrect expenses."],
  ["can_manage_categories", "Manage categories", "Create expense classifications and allocation defaults."],
  ["can_manage_recurring", "Manage recurring costs", "Create, pause and resume expected costs."],
  ["can_manage_costing", "Manage ingredients and recipes", "Confirm purchase costs and maintain effective-dated recipes."],
  ["can_view_reports", "View finance reports", "Read contribution, cost coverage and estimated operating results."]
] as const;

export default async function FinanceSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const [{ session }, query] = await Promise.all([requireFinancePermission("manage_permissions"), searchParams]);
  const rows = await getFinanceRolePermissions(session.restaurantId);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 lg:px-8">
      <Link className="text-sm font-bold text-leaf" href="/admin/finance">← Back to expenses</Link>
      <h1 className="mt-3 text-3xl font-black text-ink">Finance access</h1>
      <p className="mt-2 text-sm text-stone-600">Owner and restaurant admin always have full access. Configure least-privilege access for managers and staff.</p>
      {query.error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{query.error}</p> : null}
      {query.success ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">{query.success}</p> : null}
      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {(["manager", "staff"] as const).map((role) => {
          const row = rows.find((item) => item.role === role);
          return <form action={updateFinancePermissionsAction} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm" key={role}><input name="role" type="hidden" value={role} /><h2 className="text-lg font-black capitalize">{role}</h2><div className="mt-4 space-y-4">{permissionFields.map(([name, label, description]) => <label className="flex items-start gap-3" key={name}><input className="mt-1 h-4 w-4" defaultChecked={row?.[name] ?? false} name={name} type="checkbox" /><span><span className="block text-sm font-black">{label}</span><span className="mt-0.5 block text-xs text-stone-500">{description}</span></span></label>)}</div><button className="focus-ring mt-5 w-full rounded-lg bg-ink px-4 py-3 text-sm font-black text-white" type="submit">Save {role} access</button></form>;
        })}
      </div>
      <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Staff have no finance access by default. Granting “View finance” exposes supplier costs and expense history, so enable it only for trusted staff.</p>
    </main>
  );
}
