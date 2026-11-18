import Link from "next/link";
import { saveFinanceSetupAction } from "@/app/admin/finance/setup/actions";
import { formatFils } from "@/lib/finance";
import { getFinanceRecurringCosts, getFinanceRolePermissions, requireFinancePermission } from "@/lib/finance-data";
import { SETUP_MONTHLY_BILLS } from "@/lib/finance-simple";

export const dynamic = "force-dynamic";

export default async function FinanceSetupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ session, access }, query] = await Promise.all([requireFinancePermission("manage_recurring"), searchParams]);
  const [recurring, roles] = await Promise.all([
    getFinanceRecurringCosts(session.restaurantId),
    access.manage_permissions ? getFinanceRolePermissions(session.restaurantId) : Promise.resolve([])
  ]);
  const active = recurring.filter((cost) => cost.is_active);
  const manager = roles.find((row) => row.role === "manager");
  const staff = roles.find((row) => row.role === "staff");
  const input = "focus-ring mt-1 block w-full rounded-xl border border-stone-300 px-3 py-3 text-base";

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <Link className="text-sm font-bold text-leaf" href="/admin/finance">← Back</Link>
      <h1 className="mt-3 text-3xl font-black text-ink">Set up in 2 minutes</h1>
      <p className="mt-1 text-sm text-stone-600">So “How am I doing?” counts your regular costs. You can change this later.</p>
      {query.error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{query.error}</p> : null}

      <form action={saveFinanceSetupAction} className="mt-6 space-y-8">
        <section>
          <h2 className="text-xl font-black text-ink">1. What do you pay every month?</h2>
          <p className="mt-1 text-sm text-stone-600">Leave empty what you don’t pay. Amounts are for one month.</p>
          {active.length > 0 ? (
            <div className="mt-3 rounded-xl bg-stone-50 p-3 text-sm">
              <p className="font-bold text-stone-700">Already added:</p>
              <ul className="mt-1 list-disc pl-5 text-stone-600">
                {active.map((cost) => <li key={cost.id}>{cost.description} · {formatFils(Number(cost.amount_fils))} {cost.frequency === "monthly" ? "a month" : cost.frequency}</li>)}
              </ul>
            </div>
          ) : null}
          <div className="mt-3 space-y-3">
            {SETUP_MONTHLY_BILLS.map((bill) => (
              <div className="grid grid-cols-[1fr_96px] gap-2 rounded-xl border border-stone-200 bg-white p-3" key={bill.key}>
                <label className="text-sm font-black">
                  <span aria-hidden>{bill.icon} </span>{bill.label} (AED a month)
                  <input className={input} inputMode="decimal" name={`amount_${bill.key}`} placeholder="0.00" />
                </label>
                <label className="text-sm font-bold text-stone-600">Paid on day
                  <select className={input} defaultValue="1" name={`day_${bill.key}`}>
                    {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}
                  </select>
                </label>
              </div>
            ))}
          </div>
        </section>

        {access.manage_permissions ? (
          <section>
            <input name="access_submitted" type="hidden" value="yes" />
            <h2 className="text-xl font-black text-ink">2. Who can use Money?</h2>
            <p className="mt-1 text-sm text-stone-600">Owners can always do everything.</p>
            <div className="mt-3 space-y-2">
              <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-3">
                <input className="mt-1 h-5 w-5" defaultChecked={manager?.can_create ?? true} name="manager_create" type="checkbox" />
                <span><span className="block font-black">Managers can add bills</span><span className="text-xs text-stone-500">Take photos or type in bills.</span></span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-3">
                <input className="mt-1 h-5 w-5" defaultChecked={Boolean(manager?.can_view && manager?.can_approve && manager?.can_view_reports)} name="manager_view" type="checkbox" />
                <span><span className="block font-black">Managers can see costs and profit</span><span className="text-xs text-stone-500">They can check and save bills and see “How am I doing?”.</span></span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-3">
                <input className="mt-1 h-5 w-5" defaultChecked={staff?.can_create ?? false} name="staff_create" type="checkbox" />
                <span><span className="block font-black">Staff can add bill photos</span><span className="text-xs text-stone-500">They only send photos; a manager checks them. Staff never see costs.</span></span>
              </label>
            </div>
          </section>
        ) : null}

        {access.manage_costing ? (
          <section className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <h2 className="text-lg font-black text-ink">{access.manage_permissions ? "3." : "2."} What does each menu item cost you?</h2>
            <p className="mt-1 text-sm text-sky-950">Needed to see profit. Save this page first, then <Link className="font-black underline" href="/admin/finance/menu-costs">add menu costs</Link>.</p>
          </section>
        ) : null}

        <button className="focus-ring w-full rounded-xl bg-leaf px-4 py-4 text-base font-black text-white" type="submit">Save setup</button>
      </form>
    </main>
  );
}
