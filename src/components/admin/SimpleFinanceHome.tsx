import Link from "next/link";
import { transitionFinanceExpenseAction } from "@/app/admin/finance/actions";
import { setFinanceModeAction } from "@/app/admin/finance/mode/actions";
import { SimplePhotoUpload } from "@/components/admin/SimplePhotoUpload";
import { formatFils, type FinanceAccess, type FinanceExpense } from "@/lib/finance";
import type { FinanceDocument } from "@/lib/finance-document";
import { categoryIcon, categoryLabel, friendlyDate, plainBillStatus, plainPaymentStatus } from "@/lib/finance-simple";

type Props = {
  access: FinanceAccess;
  canUseAdvanced: boolean;
  documents: FinanceDocument[];
  expenses: FinanceExpense[];
  unbilledTillCount: number | null;
  /** What first-time setup still needs (owners/admins only). */
  setup?: { monthlyBills: number; itemsWithoutCost: number } | null;
  error?: string;
  success?: string;
};

function BigLink({ href, icon, title, hint }: { href: string; icon: string; title: string; hint: string }) {
  return (
    <Link className="focus-ring flex min-h-[88px] items-center gap-4 rounded-2xl border-2 border-stone-200 bg-white px-5 py-4 shadow-sm hover:border-leaf" href={href}>
      <span aria-hidden className="text-4xl">{icon}</span>
      <span>
        <span className="block text-xl font-black text-ink">{title}</span>
        <span className="block text-sm text-stone-500">{hint}</span>
      </span>
    </Link>
  );
}

export function SimpleFinanceHome({ access, canUseAdvanced, documents, expenses, unbilledTillCount, setup = null, error, success }: Props) {
  const toCheck = documents.filter((document) => document.status === "extracted");
  const reading = documents.filter((document) => document.status === "queued" || document.status === "processing");
  const unreadable = documents.filter((document) => document.status === "failed");
  const drafts = expenses.filter((expense) => expense.status === "draft");
  const recent = expenses.filter((expense) => expense.status !== "void").slice(0, 10);
  const todo: { href: string; text: string }[] = [];
  if (access.approve) {
    for (const document of toCheck.slice(0, 10)) {
      todo.push({ href: `/admin/finance/documents/${document.id}`, text: `Check the bill “${document.extracted_json?.supplier_name ?? document.original_name}”` });
    }
    if (drafts.length > 0) todo.push({ href: "#recent", text: `${drafts.length} bill${drafts.length === 1 ? "" : "s"} added by staff to check` });
    if (unbilledTillCount) todo.push({ href: "/admin/finance/paid-outs", text: `${unbilledTillCount} cash payment${unbilledTillCount === 1 ? "" : "s"} from the till without a bill` });
  }
  for (const document of unreadable.slice(0, 3)) {
    todo.push({ href: `/admin/finance/documents/${document.id}`, text: `A bill photo couldn't be read – try again or type it in` });
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-3xl font-black text-ink">Money</h1>
      <p className="mt-1 text-sm text-stone-600">Add your bills and see how the café is doing.</p>
      {error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p> : null}
      {success ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">✓ {success}</p> : null}

      {setup && (setup.monthlyBills === 0 || setup.itemsWithoutCost > 0) ? (
        <section className="mt-5 rounded-2xl border-2 border-sky-200 bg-sky-50 p-4">
          <h2 className="text-lg font-black text-ink">Finish setting up</h2>
          <p className="mt-1 text-sm text-sky-950">Two quick steps so profit is shown correctly.</p>
          <div className="mt-3 grid gap-2">
            {access.manage_recurring ? (
              <Link className="focus-ring flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-black" href="/admin/finance/setup">
                <span>{setup.monthlyBills === 0 ? "🏠 Add rent, salaries and other monthly bills" : `✓ ${setup.monthlyBills} monthly bill${setup.monthlyBills === 1 ? "" : "s"} added – change`}</span><span aria-hidden>→</span>
              </Link>
            ) : null}
            {access.manage_costing ? (
              <Link className="focus-ring flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-black" href="/admin/finance/menu-costs">
                <span>{setup.itemsWithoutCost > 0 ? `☕ ${setup.itemsWithoutCost} menu item${setup.itemsWithoutCost === 1 ? " needs" : "s need"} a cost` : "✓ Menu costs added – change"}</span><span aria-hidden>→</span>
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="mt-5 grid gap-3">
        {access.create ? <SimplePhotoUpload /> : null}
        {access.create ? <BigLink href="/admin/finance/new" hint="No photo? Type the amount" icon="✍️" title="Type in a bill" /> : null}
        {access.approve && unbilledTillCount !== null ? <BigLink href="/admin/finance/paid-outs" hint="Match cash taken from the till to its bill" icon="💵" title="Till payments" /> : null}
        {access.view_reports ? <BigLink href="/admin/finance/summary" hint="Sales, costs and profit in plain words" icon="📊" title="How am I doing?" /> : null}
      </div>

      {reading.length > 0 ? (
        <p className="mt-5 rounded-xl bg-sky-50 px-4 py-3 text-sm font-bold text-sky-900">
          ⏳ Reading {reading.length} bill photo{reading.length === 1 ? "" : "s"}… they’ll appear under “To do” in a minute.
        </p>
      ) : null}

      {access.view ? (
        <section className="mt-6">
          <h2 className="text-xl font-black text-ink">To do</h2>
          {todo.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-stone-300 bg-white px-4 py-6 text-center text-sm text-stone-500">Nothing to do right now 👍</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {todo.map((item, index) => (
                <li key={`${item.href}-${index}`}>
                  <Link className="focus-ring flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950" href={item.href}>
                    <span>{item.text}</span><span aria-hidden>→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <p className="mt-6 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600">After you add a bill, a manager checks it. You won’t see costs or profit here.</p>
      )}

      {access.view ? (
        <section className="mt-6" id="recent">
          <h2 className="text-xl font-black text-ink">Recent bills</h2>
          {recent.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-stone-300 bg-white px-4 py-8 text-center text-sm text-stone-500">No bills yet – tap 📷 Add a bill to add your first one.</p>
          ) : (
            <ul className="mt-2 divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
              {recent.map((expense) => {
                const categoryName = expense.finance_categories?.name ?? "Other";
                return (
                  <li className="px-4 py-3" key={expense.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-ink">
                          <span aria-hidden>{categoryIcon(categoryName)} </span>
                          {expense.supplier_name ?? expense.description}
                        </p>
                        <p className="text-xs text-stone-500">
                          {friendlyDate(expense.incurred_on)} · {categoryLabel(categoryName)} · {plainPaymentStatus(expense.payment_status)}
                          {expense.status === "draft" ? ` · ${plainBillStatus(expense.status)}` : ""}
                        </p>
                      </div>
                      <p className="shrink-0 font-black">{formatFils(Number(expense.total_fils))}</p>
                    </div>
                    {access.approve ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {expense.status === "draft" ? (
                          <form action={transitionFinanceExpenseAction}>
                            <input name="expense_id" type="hidden" value={expense.id} />
                            <button className="focus-ring rounded-lg bg-leaf px-3 py-2 text-xs font-black text-white" name="status" value="approved">✓ Looks right</button>
                          </form>
                        ) : null}
                        <details>
                          <summary className="focus-ring cursor-pointer rounded-lg px-2 py-2 text-xs font-bold text-red-700">Delete</summary>
                          <form action={transitionFinanceExpenseAction} className="mt-1">
                            <input name="expense_id" type="hidden" value={expense.id} />
                            <button className="focus-ring rounded-lg border border-red-300 px-3 py-2 text-xs font-black text-red-700" name="status" value="void">Yes, delete this bill</button>
                          </form>
                        </details>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {(access.manage_recurring || access.manage_costing) && setup && setup.monthlyBills > 0 && setup.itemsWithoutCost === 0 ? (
        <p className="mt-8 text-center text-sm">
          {access.manage_recurring ? <Link className="font-bold text-leaf underline" href="/admin/finance/setup">Monthly bills & who can use Money</Link> : null}
          {access.manage_recurring && access.manage_costing ? " · " : ""}
          {access.manage_costing ? <Link className="font-bold text-leaf underline" href="/admin/finance/menu-costs">Menu costs</Link> : null}
        </p>
      ) : null}

      {canUseAdvanced ? (
        <form action={setFinanceModeAction} className="mt-8 text-center">
          <input name="mode" type="hidden" value="advanced" />
          <button className="focus-ring text-xs font-bold text-stone-500 underline" type="submit">Switch to advanced view (for accountants)</button>
        </form>
      ) : null}
    </main>
  );
}
